// ─── Master Data ───────────────────────────────────────────────

export interface Item {
  id: string
  sku: string
  name: string
  unit: string
  category: string
  minQty: number
  imageUrl?: string
  createdAt: string
  updatedAt: string
}

export interface Warehouse {
  id: string
  code: 'A' | 'B' | string
  name: string
  location?: string
}

export interface StockPosition {
  id: string
  itemId: string
  warehouseId: string
  binCode: string
  onHand: number
  reserved: number
  available: number
  item?: Item
  warehouse?: Warehouse
}

export interface Employee {
  id: string
  code: string
  name: string
  role: EmployeeRole
  warehouseId?: string
  active: boolean
}

export type EmployeeRole =
  | 'WAREHOUSE_MANAGER'
  | 'WAREHOUSE_STAFF'
  | 'REQUESTER'
  | 'SUPERVISOR'
  | 'ADMIN'

// ─── Work Order ────────────────────────────────────────────────

export interface WorkOrder {
  id: string
  woNumber: string
  project: string
  department: string
  machine?: string
  activity: string
  status: 'OPEN' | 'CLOSED' | 'CANCELLED'
  createdAt: string
}

// ─── Cost Snapshot ────────────────────────────────────────────
// ราคาทุนที่ล็อก ณ วันเบิก — ไม่เปลี่ยนหลังยืนยัน

export interface CostSnapshot {
  itemId: string
  sku: string
  unitCost: number
  snapshotAt: string
}

// ─── Withdraw Transaction (การเบิก) ──────────────────────────

export type HandshakeStatus = 'PENDING' | 'REQ_SIGNED' | 'ISS_SIGNED' | 'COMPLETE'
export type SyncStatus = 'PENDING' | 'SYNCED' | 'ERROR' | 'SKIPPED'

export interface WithdrawTransaction {
  id: string
  offlineId: string
  woId: string
  wo?: WorkOrder
  requesterId: string
  issuerId?: string
  handshakeStatus: HandshakeStatus
  syncStatus: SyncStatus
  syncedAt?: string
  totalCost: number
  lines: WithdrawLine[]
  softBlocked: boolean
  createdAt: string
  confirmedAt?: string
}

export interface WithdrawLine {
  id: string
  transactionId: string
  itemId: string
  item?: Item
  warehouseId: string
  qty: number
  softBlockReason?: SoftBlockReason
  costSnapshot: CostSnapshot
}

export type SoftBlockReason =
  | 'CROSS_WAREHOUSE'
  | 'URGENT_FIELD'
  | 'IN_TRANSIT'

// ─── Receive Transaction (การรับเข้า) ───────────────────────

export interface ReceiveTransaction {
  id: string
  offlineId: string
  poRef: string
  supplierName: string
  warehouseId: string
  receivedById: string
  syncStatus: SyncStatus
  totalValue: number
  lines: ReceiveLine[]
  createdAt: string
}

export interface ReceiveLine {
  id: string
  transactionId: string
  itemId: string
  item?: Item
  qty: number
  unitCost: number
  lotNumber?: string
  binCode?: string
}

// ─── Return Transaction (การส่งคืน) ──────────────────────────

export type ItemCondition = 'GOOD' | 'DAMAGED' | 'PARTIAL'

export interface ReturnTransaction {
  id: string
  offlineId: string
  originalWithdrawId: string
  returnedById: string
  warehouseId: string
  syncStatus: SyncStatus
  lines: ReturnLine[]
  createdAt: string
}

export interface ReturnLine {
  id: string
  transactionId: string
  itemId: string
  item?: Item
  qty: number
  condition: ItemCondition
}

// ─── Cycle Count (ตรวจนับสต็อก) ─────────────────────────────

export interface CycleCountSession {
  id: string
  sessionCode: string
  warehouseIds: string[]
  status: 'IN_PROGRESS' | 'RECONCILED' | 'CANCELLED'
  startedById: string
  reconciledById?: string
  totalVarianceValue?: number
  lines: CycleCountLine[]
  createdAt: string
  reconciledAt?: string
}

export interface CycleCountLine {
  id: string
  sessionId: string
  itemId: string
  item?: Item
  warehouseId: string
  systemQty: number
  countedQty: number
  variance: number
  varianceReason?: CycleVarianceReason
}

export type CycleVarianceReason =
  | 'DAMAGED'
  | 'MISCOUNT'
  | 'LOST'
  | 'UNRECORDED_WITHDRAW'

// ─── Audit Log ────────────────────────────────────────────────

export interface AuditLog {
  id: string
  action: AuditAction
  entityType: string
  entityId: string
  userId: string
  user?: Employee
  details: Record<string, unknown>
  createdAt: string
}

export type AuditAction =
  | 'WITHDRAW_CREATED'
  | 'WITHDRAW_CONFIRMED'
  | 'WITHDRAW_HANDSHAKE'
  | 'RECEIVE_CREATED'
  | 'RETURN_CONFIRMED'
  | 'CYCLE_COUNT_RECONCILED'
  | 'STOCK_ADJUSTED'
  | 'SYNC_SUCCESS'
  | 'SYNC_ERROR'

// ─── Offline Sync Queue ───────────────────────────────────────

export type SyncEventType = 'GR' | 'GI' | 'RETURN' | 'CYCLE_RECONCILE' | 'ADJUST'

export interface SyncEvent {
  id: string
  type: SyncEventType
  payload: unknown
  status: 'PENDING' | 'SYNCED' | 'ERROR'
  retryCount: number
  errorMessage?: string
  createdAt: string
  syncedAt?: string
}

// ─── TRCloud Integration Types ────────────────────────────────

export interface TRCloudGRPayload {
  doc_type: 'GR'
  po_ref: string
  warehouse_id: string
  received_by: string
  received_at: string
  offline_id: string
  lines: Array<{
    sku: string
    qty: number
    bin: string
    unit: string
    lot?: string
  }>
}

export interface TRCloudGIPayload {
  doc_type: 'GI'
  mr_ref: string
  dest?: string
  kind: 'TRANSFER' | 'CONSUME' | 'SCRAP'
  issued_by: string
  issued_at: string
  offline_id: string
  lines: Array<{
    sku: string
    qty: number
    bin: string
    unit: string
  }>
}

export interface TRCloudResponse {
  success: boolean
  doc_number: string
  message?: string
}

// ─── Dashboard / Reports ──────────────────────────────────────

export interface DashboardKPI {
  monthlyWithdrawCost: number
  totalStockValue: number
  pendingSyncCount: number
  cycleVarianceValue: number
  warehouseBreakdown: Array<{ warehouseCode: string; value: number }>
}

export interface MachineABCEntry {
  machineCode: string
  machineName: string
  totalCost: number
  percentage: number
}

export interface FraudAlert {
  type: 'CROSS_PROJECT' | 'ADJUST_NO_REASON' | 'ONE_SIDED_HANDSHAKE'
  count: number
  severity: 'LOW' | 'HIGH'
}

export interface ProjectCostBreakdown {
  projectName: string
  costCenterId: string
  totalCost: number
  percentage: number
  color: string
}
