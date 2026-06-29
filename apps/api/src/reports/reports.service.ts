import { Injectable } from '@nestjs/common'
import type { DashboardKPI, MachineABCEntry, FraudAlert, ProjectCostBreakdown } from '@warehouse/types'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  async getDashboardKPI(): Promise<DashboardKPI> {
    const [monthlyWithdraw, stockValue, pendingSync, cycleVariance] =
      await Promise.all([
        this.getMonthlyWithdrawCost(),
        this.getTotalStockValue(),
        this.getPendingSyncCount(),
        this.getCycleVarianceValue(),
      ])

    return {
      monthlyWithdrawCost: monthlyWithdraw,
      totalStockValue: stockValue.total,
      pendingSyncCount: pendingSync,
      cycleVarianceValue: cycleVariance,
      warehouseBreakdown: stockValue.breakdown,
    }
  }

  async getMachineABC(): Promise<MachineABCEntry[]> {
    const rows = await this.db.query<{
      machine_code: string
      machine_name: string
      total_cost: number
      percentage: number
    }>(`SELECT * FROM get_machine_abc_this_month()`)
    return rows.map(row => ({
      machineCode: row.machine_code,
      machineName: row.machine_name,
      totalCost: Number(row.total_cost),
      percentage: Number(row.percentage),
    }))
  }

  async getFraudAlerts(): Promise<FraudAlert[]> {
    const [crossProject, noReason, onesided] = await Promise.all([
      this.countCrossProjectWithdraws(),
      this.countAdjustWithoutReason(),
      this.countOnesidedHandshake(),
    ])

    return [
      { type: 'CROSS_PROJECT', count: crossProject, severity: 'LOW' },
      { type: 'ADJUST_NO_REASON', count: noReason, severity: 'LOW' },
      { type: 'ONE_SIDED_HANDSHAKE', count: onesided, severity: 'HIGH' },
    ]
  }

  async getProjectCostBreakdown(): Promise<ProjectCostBreakdown[]> {
    const rows = await this.db.query<{
      project_name: string
      cost_center_id: string
      total_cost: number
      percentage: number
    }>(`SELECT * FROM get_project_cost_breakdown_this_month()`)
    const colors = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626']
    return rows.map((row, i) => ({
      projectName: row.project_name,
      costCenterId: row.cost_center_id,
      totalCost: Number(row.total_cost),
      percentage: Number(row.percentage),
      color: colors[i % colors.length],
    }))
  }

  private async getMonthlyWithdrawCost(): Promise<number> {
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const row = await this.db.queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(total_cost), 0) AS total
       FROM withdraw_transactions
       WHERE handshake_status = 'COMPLETE' AND confirmed_at >= $1`,
      [start],
    )
    return Number(row?.total ?? 0)
  }

  private async getTotalStockValue(): Promise<{
    total: number
    breakdown: Array<{ warehouseCode: string; value: number }>
  }> {
    const rows = await this.db.query<{
      warehouse_code: string
      value: string
    }>(`
      SELECT w.code AS warehouse_code,
             COALESCE(SUM(sp.on_hand * COALESCE(rl.unit_cost, 0)), 0) AS value
      FROM stock_positions sp
      JOIN warehouses w ON w.id = sp.warehouse_id
      LEFT JOIN LATERAL (
        SELECT unit_cost FROM receive_lines
        WHERE item_id = sp.item_id
        ORDER BY id DESC LIMIT 1
      ) rl ON TRUE
      GROUP BY w.code
    `)

    let total = 0
    const breakdown = rows.map(r => {
      const value = Number(r.value)
      total += value
      return { warehouseCode: r.warehouse_code, value }
    })

    return { total, breakdown }
  }

  private async getPendingSyncCount(): Promise<number> {
    return this.db.queryCount(
      `SELECT COUNT(*)::text AS count FROM sync_queue WHERE status = 'PENDING'`,
    )
  }

  private async getCycleVarianceValue(): Promise<number> {
    const row = await this.db.queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(total_variance_value), 0) AS total
       FROM cycle_count_sessions WHERE status = 'IN_PROGRESS'`,
    )
    return Number(row?.total ?? 0)
  }

  private async countCrossProjectWithdraws(): Promise<number> {
    return this.db.queryCount(
      `SELECT COUNT(*)::text AS count FROM withdraw_lines WHERE soft_block_reason = 'CROSS_WAREHOUSE'`,
    )
  }

  private async countAdjustWithoutReason(): Promise<number> {
    return this.db.queryCount(
      `SELECT COUNT(*)::text AS count FROM cycle_count_lines
       WHERE variance <> 0 AND variance_reason IS NULL`,
    )
  }

  private async countOnesidedHandshake(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    return this.db.queryCount(
      `SELECT COUNT(*)::text AS count FROM withdraw_transactions
       WHERE handshake_status = 'REQ_SIGNED' AND created_at <= $1`,
      [cutoff],
    )
  }
}
