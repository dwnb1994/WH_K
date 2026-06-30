import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { TRCloudService } from '../trcloud/trcloud.service'
import { TrcloudPullService } from '../trcloud/trcloud-pull.service'
import { DatabaseService } from '../database/database.service'

interface SyncQueueRow {
  id: string
  type: 'GR' | 'GI' | 'RETURN' | 'CYCLE_RECONCILE' | 'ADJUST'
  payload: Record<string, unknown>
  retry_count: number
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name)
  private readonly MAX_RETRY = 3

  constructor(
    private readonly db: DatabaseService,
    private readonly trcloud: TRCloudService,
    private readonly pull: TrcloudPullService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async flushQueue(): Promise<void> {
    const pending = await this.db.query<SyncQueueRow>(
      `SELECT id, type, payload, retry_count
       FROM sync_queue
       WHERE status = 'PENDING'
       ORDER BY created_at ASC
       LIMIT 100`,
    )

    if (!pending.length) return

    this.logger.log(`Flushing ${pending.length} pending sync events`)
    await Promise.allSettled(pending.map(row => this.processRow(row)))
  }

  async processRow(row: SyncQueueRow): Promise<void> {
    try {
      await this.dispatch(row)

      await this.db.query(
        `UPDATE sync_queue SET status = 'SYNCED', synced_at = NOW() WHERE id = $1`,
        [row.id],
      )
      await this.markTransactionSynced(row)

      this.logger.log(`Synced event ${row.id} (${row.type})`)
    } catch (err) {
      const nextRetry = row.retry_count + 1
      const isDead = nextRetry >= this.MAX_RETRY

      await this.db.query(
        `UPDATE sync_queue
         SET status = $2, retry_count = $3, error_message = $4
         WHERE id = $1`,
        [row.id, isDead ? 'ERROR' : 'PENDING', nextRetry, (err as Error).message],
      )

      this.logger.error(
        `Event ${row.id} failed (retry ${nextRetry}/${this.MAX_RETRY}): ${(err as Error).message}`,
      )

      if (isDead) {
        await this.db.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, user_id, details)
           VALUES ('SYNC_ERROR', 'sync_queue', $1, 'system', $2)`,
          [row.id, JSON.stringify({ type: row.type, error: (err as Error).message })],
        )
      }
    }
  }

  private async dispatch(row: SyncQueueRow): Promise<void> {
    switch (row.type) {
      case 'GI': {
        const tx = await this.fetchWithdrawForSync(row.payload['transactionId'] as string)
        const result = await this.trcloud.postGoodsIssue({
          doc_type: 'GI',
          mr_ref: tx.wo_number,
          kind: 'CONSUME',
          issued_by: tx.issuer_code,
          issued_at: tx.confirmed_at,
          offline_id: tx.offline_id,
          lines: tx.lines.map(l => ({
            sku: l.sku,
            qty: l.qty,
            bin: l.bin_code,
            unit: l.unit,
          })),
        })
        await this.pull.pullDocAfterPush('mr', result.doc_number || tx.offline_id)
        break
      }

      case 'GR': {
        const rx = await this.fetchReceiveForSync(row.payload['receiveId'] as string)
        const result = await this.trcloud.postGoodsReceipt({
          doc_type: 'GR',
          po_ref: rx.po_ref,
          warehouse_id: rx.warehouse_code,
          received_by: rx.received_by_code,
          received_at: rx.created_at,
          offline_id: rx.offline_id,
          lines: rx.lines.map(l => ({
            sku: l.sku,
            qty: l.qty,
            bin: l.bin_code ?? 'DEFAULT',
            unit: l.unit,
            lot: l.lot_number ?? undefined,
          })),
        })
        await this.pull.pullDocAfterPush('gr', result.doc_number || rx.offline_id)
        break
      }

      default:
        this.logger.warn(`Unknown sync type: ${row.type}`)
    }
  }

  private async markTransactionSynced(row: SyncQueueRow) {
    if (row.type === 'GI') {
      await this.db.query(
        `UPDATE withdraw_transactions SET sync_status = 'SYNCED', synced_at = NOW() WHERE id = $1`,
        [row.payload['transactionId']],
      )
    } else if (row.type === 'GR') {
      await this.db.query(
        `UPDATE receive_transactions SET sync_status = 'SYNCED', synced_at = NOW() WHERE id = $1`,
        [row.payload['receiveId']],
      )
    }
  }

  async getQueueStatus() {
    const rows = await this.db.query<{ status: string }>(
      `SELECT status FROM sync_queue`,
    )
    const counts = { PENDING: 0, SYNCED: 0, ERROR: 0 }
    for (const row of rows) {
      counts[row.status as keyof typeof counts] =
        (counts[row.status as keyof typeof counts] ?? 0) + 1
    }

    const recent = await this.db.query(
      `SELECT id, type, status, retry_count, error_message, created_at, synced_at
       FROM sync_queue ORDER BY created_at DESC LIMIT 50`,
    )

    return { counts, recent }
  }

  private async fetchWithdrawForSync(id: string) {
    const tx = await this.db.queryOne<{
      offline_id: string
      confirmed_at: string
      wo_number: string
      issuer_code: string
    }>(`
      SELECT wt.offline_id, wt.confirmed_at, wo.wo_number, e.code AS issuer_code
      FROM withdraw_transactions wt
      JOIN work_orders wo ON wo.id = wt.wo_id
      JOIN employees e ON e.id = wt.issuer_id
      WHERE wt.id = $1
    `, [id])

    if (!tx) throw new Error(`Withdraw ${id} not found`)

    const lines = await this.db.query<{
      sku: string
      qty: number
      unit: string
      bin_code: string
    }>(`
      SELECT i.sku, wl.qty, i.unit,
             COALESCE(sp.bin_code, 'DEFAULT') AS bin_code
      FROM withdraw_lines wl
      JOIN items i ON i.id = wl.item_id
      LEFT JOIN stock_positions sp
        ON sp.item_id = wl.item_id AND sp.warehouse_id = wl.warehouse_id
      WHERE wl.transaction_id = $1
    `, [id])

    return {
      wo_number: tx.wo_number,
      issuer_code: tx.issuer_code,
      confirmed_at: tx.confirmed_at,
      offline_id: tx.offline_id,
      lines,
    }
  }

  private async fetchReceiveForSync(id: string) {
    const rx = await this.db.queryOne<{
      offline_id: string
      po_ref: string
      created_at: string
      warehouse_code: string
      received_by_code: string
    }>(`
      SELECT rt.offline_id, rt.po_ref, rt.created_at,
             w.code AS warehouse_code, e.code AS received_by_code
      FROM receive_transactions rt
      JOIN warehouses w ON w.id = rt.warehouse_id
      JOIN employees e ON e.id = rt.received_by_id
      WHERE rt.id = $1
    `, [id])

    if (!rx) throw new Error(`Receive ${id} not found`)

    const lines = await this.db.query<{
      sku: string
      qty: number
      unit: string
      bin_code: string | null
      lot_number: string | null
    }>(`
      SELECT i.sku, rl.qty, i.unit, rl.bin_code, rl.lot_number
      FROM receive_lines rl
      JOIN items i ON i.id = rl.item_id
      WHERE rl.transaction_id = $1
    `, [id])

    return { ...rx, lines }
  }
}
