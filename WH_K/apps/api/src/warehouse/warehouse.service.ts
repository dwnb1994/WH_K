import { Injectable, BadRequestException, ConflictException } from '@nestjs/common'
import type { CreateWithdrawInput, CreateReceiveInput } from '@warehouse/validators'
import type { WithdrawTransaction, StockPosition } from '@warehouse/types'
import { TRCloudService } from '../trcloud/trcloud.service'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class WarehouseService {
  constructor(
    private readonly db: DatabaseService,
    private readonly trcloud: TRCloudService,
    private readonly audit: AuditService,
  ) {}

  async createWithdraw(input: CreateWithdrawInput): Promise<WithdrawTransaction> {
    const existing = await this.db.queryOne(
      `SELECT id FROM withdraw_transactions WHERE offline_id = $1`,
      [input.offlineId],
    )
    if (existing) throw new ConflictException('offline_id already processed')

    const snapshots = await this.getCostSnapshots(input.lines.map(l => l.itemId))
    const softBlockedLines = await this.checkStockAvailability(input.lines)
    const totalCost = input.lines.reduce((sum, line) => {
      const snap = snapshots[line.itemId]
      return sum + (snap?.unitCost ?? 0) * line.qty
    }, 0)

    const tx = await this.db.queryOne<Record<string, unknown>>(
      `INSERT INTO withdraw_transactions
         (offline_id, wo_id, requester_id, handshake_status, sync_status, total_cost, soft_blocked)
       VALUES ($1, $2, $3, 'PENDING', 'PENDING', $4, $5)
       RETURNING *`,
      [
        input.offlineId,
        input.woId,
        input.requesterId,
        totalCost,
        softBlockedLines.length > 0,
      ],
    )
    if (!tx) throw new BadRequestException('Failed to create withdraw')

    for (const l of input.lines) {
      await this.db.query(
        `INSERT INTO withdraw_lines
           (transaction_id, item_id, warehouse_id, qty, soft_block_reason, cost_snapshot_unit, cost_snapshot_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          tx.id,
          l.itemId,
          l.warehouseId,
          l.qty,
          l.softBlockReason ?? null,
          snapshots[l.itemId]?.unitCost ?? 0,
        ],
      )
    }

    await this.reserveStock(input.lines)

    await this.audit.log({
      action: 'WITHDRAW_CREATED',
      entityType: 'withdraw_transactions',
      entityId: tx.id as string,
      userId: input.requesterId,
      details: { woId: input.woId, lineCount: input.lines.length, totalCost },
    })

    return this.findWithdrawById(tx.id as string)
  }

  async confirmHandshake(transactionId: string, issuerId: string): Promise<WithdrawTransaction> {
    const tx = await this.db.queryOne<{ handshake_status: string }>(
      `SELECT handshake_status FROM withdraw_transactions WHERE id = $1`,
      [transactionId],
    )
    if (!tx) throw new BadRequestException('Transaction not found')
    if (tx.handshake_status === 'COMPLETE') throw new ConflictException('Already confirmed')

    const lines = await this.db.query<{
      item_id: string
      warehouse_id: string
      qty: number
    }>(
      `SELECT item_id, warehouse_id, qty FROM withdraw_lines WHERE transaction_id = $1`,
      [transactionId],
    )

    await this.db.query(
      `UPDATE withdraw_transactions
       SET issuer_id = $2, handshake_status = 'COMPLETE', confirmed_at = NOW(), sync_status = 'PENDING'
       WHERE id = $1`,
      [transactionId, issuerId],
    )

    await this.deductStock(lines)

    await this.db.query(
      `INSERT INTO sync_queue (type, payload, status) VALUES ('GI', $1, 'PENDING')`,
      [JSON.stringify({ transactionId, issuerId })],
    )

    await this.audit.log({
      action: 'WITHDRAW_HANDSHAKE',
      entityType: 'withdraw_transactions',
      entityId: transactionId,
      userId: issuerId,
      details: { issuerId },
    })

    return this.findWithdrawById(transactionId)
  }

  async listWithdraws(params: { woId?: string; status?: string; limit: number }) {
    const conditions: string[] = []
    const values: unknown[] = []
    let i = 1

    if (params.woId) {
      conditions.push(`wt.wo_id = $${i++}`)
      values.push(params.woId)
    }
    if (params.status) {
      conditions.push(`wt.handshake_status = $${i++}`)
      values.push(params.status)
    }
    values.push(params.limit)

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    return this.db.query(
      `SELECT wt.*, wo.wo_number, wo.project, e.name AS requester_name
       FROM withdraw_transactions wt
       JOIN work_orders wo ON wo.id = wt.wo_id
       JOIN employees e ON e.id = wt.requester_id
       ${where}
       ORDER BY wt.created_at DESC
       LIMIT $${i}`,
      values,
    )
  }

  async listReceives(params: { limit: number; syncStatus?: string }) {
    const conditions: string[] = []
    const values: unknown[] = []
    let i = 1

    if (params.syncStatus) {
      conditions.push(`rt.sync_status = $${i++}`)
      values.push(params.syncStatus)
    }
    values.push(params.limit)

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    return this.db.query(
      `SELECT rt.id, rt.offline_id, rt.po_ref, rt.supplier_name, rt.warehouse_id,
              rt.sync_status, rt.total_value, rt.created_at,
              e.name AS received_by_name, e.code AS received_by_code
       FROM receive_transactions rt
       JOIN employees e ON e.id = rt.received_by_id
       ${where}
       ORDER BY rt.created_at DESC
       LIMIT $${i}`,
      values,
    )
  }

  async listItems(params: { search?: string; limit: number }) {
    const values: unknown[] = []
    let where = ''
    let i = 1

    if (params.search) {
      where = `WHERE sku ILIKE $${i} OR name ILIKE $${i}`
      values.push(`%${params.search}%`)
      i++
    }
    values.push(params.limit)

    const items = await this.db.query<{
      id: string
      sku: string
      name: string
      unit: string
      category: string | null
      min_qty: number
      created_at: string
    }>(
      `SELECT id, sku, name, unit, category, min_qty, created_at
       FROM items ${where} ORDER BY sku LIMIT $${i}`,
      values,
    )
    if (!items.length) return []

    const positions = await this.db.query<{ item_id: string; on_hand: number }>(
      `SELECT item_id, on_hand FROM stock_positions WHERE item_id = ANY($1::uuid[])`,
      [items.map(it => it.id)],
    )

    const onHand: Record<string, number> = {}
    for (const p of positions) {
      onHand[p.item_id] = (onHand[p.item_id] ?? 0) + Number(p.on_hand)
    }

    return items.map(it => ({
      ...it,
      on_hand: onHand[it.id] ?? 0,
      stock_status: (onHand[it.id] ?? 0) <= Number(it.min_qty) ? 'LOW' : 'OK',
    }))
  }

  async listEmployees() {
    return this.db.query(
      `SELECT e.id, e.code, e.name, e.role, e.active,
              w.code AS warehouse_code, w.name AS warehouse_name
       FROM employees e
       LEFT JOIN warehouses w ON w.id = e.warehouse_id
       ORDER BY e.name`,
    )
  }

  async createReceive(input: CreateReceiveInput) {
    const existing = await this.db.queryOne(
      `SELECT id FROM receive_transactions WHERE offline_id = $1`,
      [input.offlineId],
    )
    if (existing) throw new ConflictException('offline_id already processed')

    const totalValue = input.lines.reduce((s, l) => s + l.unitCost * l.qty, 0)

    const rx = await this.db.queryOne<Record<string, unknown>>(
      `INSERT INTO receive_transactions
         (offline_id, po_ref, supplier_name, warehouse_id, received_by_id, sync_status, total_value)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
       RETURNING *`,
      [
        input.offlineId,
        input.poRef,
        input.supplierName,
        input.warehouseId,
        input.receivedById,
        totalValue,
      ],
    )
    if (!rx) throw new BadRequestException('Failed to create receive')

    for (const l of input.lines) {
      await this.db.query(
        `INSERT INTO receive_lines
           (transaction_id, item_id, qty, unit_cost, lot_number, bin_code)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [rx.id, l.itemId, l.qty, l.unitCost, l.lotNumber ?? null, l.binCode ?? null],
      )
    }

    await this.addStock(input.warehouseId, input.lines)

    await this.db.query(
      `INSERT INTO sync_queue (type, payload, status) VALUES ('GR', $1, 'PENDING')`,
      [JSON.stringify({ receiveId: rx.id })],
    )

    await this.audit.log({
      action: 'RECEIVE_CREATED',
      entityType: 'receive_transactions',
      entityId: rx.id as string,
      userId: input.receivedById,
      details: { poRef: input.poRef, totalValue },
    })

    return rx
  }

  async getStock(params: { warehouseId?: string; search?: string }): Promise<StockPosition[]> {
    const conditions: string[] = []
    const values: unknown[] = []
    let i = 1

    if (params.warehouseId) {
      conditions.push(`sp.warehouse_id = $${i++}`)
      values.push(params.warehouseId)
    }
    if (params.search) {
      conditions.push(`(i.sku ILIKE $${i} OR i.name ILIKE $${i})`)
      values.push(`%${params.search}%`)
      i++
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = await this.db.query(
      `SELECT sp.*,
              json_build_object('id', i.id, 'sku', i.sku, 'name', i.name, 'unit', i.unit) AS items,
              json_build_object('id', w.id, 'code', w.code, 'name', w.name) AS warehouses
       FROM stock_positions sp
       JOIN items i ON i.id = sp.item_id
       JOIN warehouses w ON w.id = sp.warehouse_id
       ${where}
       ORDER BY sp.updated_at DESC`,
      values,
    )
    return rows as unknown as StockPosition[]
  }

  async getItemStockAllWarehouses(itemId: string): Promise<StockPosition[]> {
    const rows = await this.db.query(
      `SELECT sp.*,
              json_build_object('id', i.id, 'sku', i.sku, 'name', i.name, 'unit', i.unit) AS items,
              json_build_object('id', w.id, 'code', w.code, 'name', w.name) AS warehouses
       FROM stock_positions sp
       JOIN items i ON i.id = sp.item_id
       JOIN warehouses w ON w.id = sp.warehouse_id
       WHERE sp.item_id = $1`,
      [itemId],
    )
    return rows as unknown as StockPosition[]
  }

  async openCycleCount(warehouseIds: string[], startedById: string) {
    const sessionCode = `CC-${new Date().toISOString().slice(2, 7).replace('-', '')}`

    const session = await this.db.queryOne<Record<string, unknown>>(
      `INSERT INTO cycle_count_sessions (session_code, warehouse_ids, started_by_id, status)
       VALUES ($1, $2::uuid[], $3, 'IN_PROGRESS')
       RETURNING *`,
      [sessionCode, warehouseIds, startedById],
    )
    if (!session) throw new BadRequestException('Failed to open cycle count')

    const positions = await this.db.query<{
      item_id: string
      warehouse_id: string
      on_hand: number
    }>(
      `SELECT item_id, warehouse_id, on_hand FROM stock_positions
       WHERE warehouse_id = ANY($1::uuid[])`,
      [warehouseIds],
    )

    for (const p of positions) {
      await this.db.query(
        `INSERT INTO cycle_count_lines (session_id, item_id, warehouse_id, system_qty, counted_qty)
         VALUES ($1, $2, $3, $4, NULL)`,
        [session.id, p.item_id, p.warehouse_id, p.on_hand],
      )
    }

    return session
  }

  async reconcileCycleCount(
    sessionId: string,
    lines: Array<{ itemId: string; warehouseId: string; countedQty: number; varianceReason?: string }>,
    reconciledById: string,
  ) {
    for (const line of lines) {
      await this.db.query(
        `UPDATE cycle_count_lines
         SET counted_qty = $4, variance_reason = $5
         WHERE session_id = $1 AND item_id = $2 AND warehouse_id = $3`,
        [sessionId, line.itemId, line.warehouseId, line.countedQty, line.varianceReason ?? null],
      )
    }

    await this.db.query(
      `UPDATE cycle_count_sessions
       SET status = 'RECONCILED', reconciled_by_id = $2, reconciled_at = NOW()
       WHERE id = $1`,
      [sessionId, reconciledById],
    )

    await this.audit.log({
      action: 'CYCLE_COUNT_RECONCILED',
      entityType: 'cycle_count_sessions',
      entityId: sessionId,
      userId: reconciledById,
      details: { lineCount: lines.length },
    })
  }

  private async checkStockAvailability(
    lines: Array<{ itemId: string; warehouseId: string; qty: number }>,
  ) {
    const blocked: typeof lines = []
    for (const line of lines) {
      const row = await this.db.queryOne<{ on_hand: number; reserved: number }>(
        `SELECT on_hand, reserved FROM stock_positions
         WHERE item_id = $1 AND warehouse_id = $2 LIMIT 1`,
        [line.itemId, line.warehouseId],
      )
      const available = (row?.on_hand ?? 0) - (row?.reserved ?? 0)
      if (available < line.qty) blocked.push(line)
    }
    return blocked
  }

  private async reserveStock(
    lines: Array<{ itemId: string; warehouseId: string; qty: number }>,
  ) {
    for (const line of lines) {
      await this.db.query(`SELECT increment_reserved($1, $2, $3)`, [
        line.itemId,
        line.warehouseId,
        line.qty,
      ])
    }
  }

  private async deductStock(
    lines: Array<{ item_id: string; warehouse_id: string; qty: number }>,
  ) {
    for (const line of lines) {
      await this.db.query(`SELECT deduct_stock($1, $2, $3)`, [
        line.item_id,
        line.warehouse_id,
        line.qty,
      ])
    }
  }

  private async addStock(
    warehouseId: string,
    lines: Array<{ itemId: string; qty: number; binCode?: string }>,
  ) {
    for (const line of lines) {
      await this.db.query(`SELECT add_stock($1, $2, $3, $4)`, [
        line.itemId,
        warehouseId,
        line.qty,
        line.binCode ?? 'DEFAULT',
      ])
    }
  }

  private async getCostSnapshots(itemIds: string[]): Promise<Record<string, { unitCost: number }>> {
    if (!itemIds.length) return {}

    const rows = await this.db.query<{ item_id: string; unit_cost: number }>(
      `SELECT DISTINCT ON (item_id) item_id, unit_cost
       FROM receive_lines
       WHERE item_id = ANY($1::uuid[])
       ORDER BY item_id, id DESC`,
      [itemIds],
    )

    const snapshots: Record<string, { unitCost: number }> = {}
    for (const row of rows) {
      snapshots[row.item_id] = { unitCost: Number(row.unit_cost) }
    }
    return snapshots
  }

  private async findWithdrawById(id: string): Promise<WithdrawTransaction> {
    const tx = await this.db.queryOne(
      `SELECT wt.*,
              json_agg(
                json_build_object(
                  'id', wl.id,
                  'item_id', wl.item_id,
                  'warehouse_id', wl.warehouse_id,
                  'qty', wl.qty,
                  'soft_block_reason', wl.soft_block_reason,
                  'cost_snapshot_unit', wl.cost_snapshot_unit,
                  'items', json_build_object('id', i.id, 'sku', i.sku, 'name', i.name, 'unit', i.unit),
                  'warehouses', json_build_object('id', w.id, 'code', w.code, 'name', w.name)
                )
              ) FILTER (WHERE wl.id IS NOT NULL) AS withdraw_lines
       FROM withdraw_transactions wt
       LEFT JOIN withdraw_lines wl ON wl.transaction_id = wt.id
       LEFT JOIN items i ON i.id = wl.item_id
       LEFT JOIN warehouses w ON w.id = wl.warehouse_id
       WHERE wt.id = $1
       GROUP BY wt.id`,
      [id],
    )
    return tx as WithdrawTransaction
  }
}
