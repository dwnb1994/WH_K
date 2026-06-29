import axios from 'axios'
import type {
  WithdrawTransaction, ReceiveTransaction, StockPosition,
  DashboardKPI, MachineABCEntry, FraudAlert, ProjectCostBreakdown,
  CycleCountSession, AuditLog,
} from '@warehouse/types'
import type { CreateWithdrawInput, CreateReceiveInput } from '@warehouse/validators'

export interface ReceiveListRow {
  id: string
  offline_id: string
  po_ref: string
  supplier_name: string
  warehouse_id: string
  sync_status: string
  total_value: number
  created_at: string
  employees?: { name: string; code: string }
}

export interface ItemListRow {
  id: string
  sku: string
  name: string
  unit: string
  category: string | null
  min_qty: number
  on_hand: number
  stock_status: 'OK' | 'LOW'
}

export interface EmployeeListRow {
  id: string
  code: string
  name: string
  role: string
  active: boolean
  warehouses?: { code: string; name: string } | null
}

export interface SyncStatusResponse {
  counts: { PENDING: number; SYNCED: number; ERROR: number }
  recent: Array<{
    id: string
    type: string
    status: string
    retry_count: number
    error_message: string | null
    created_at: string
    synced_at: string | null
  }>
}

export interface PurchaseOrderRow {
  po_id: string
  po_ref: string
  supplier_name: string
  issue_date: string
  due_date: string
  grand_total: number
  status: string
  approve_status: string
  payment: string
  department: string
  project: string
  reference: string
  line_count: number
  products?: string[]
}

export interface PurchaseOrderLine {
  po_id: string
  po_ref?: string
  product_id?: string
  product_name?: string
  description?: string
  quantity?: number
  unit?: string
  price?: number
  item_total?: number
  item_id?: string | number
}

export interface PurchaseOrderListResponse {
  meta: {
    fetched_at: string | null
    date_from: string
    date_to: string
    count: number
    source: string
  }
  orders: PurchaseOrderRow[]
}

// ─── Axios instance ────────────────────────────────────────────

let _token = ''

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? '',
  timeout: 15_000,
})

apiClient.interceptors.request.use(cfg => {
  if (_token) cfg.headers.Authorization = `Bearer ${_token}`
  return cfg
})

apiClient.interceptors.response.use(
  r => r,
  err => Promise.reject(err?.response?.data ?? err),
)

export function setAuthToken(token: string) {
  _token = token
}

// ─── Warehouse API ─────────────────────────────────────────────

export const warehouseApi = {
  createWithdraw: (body: CreateWithdrawInput) =>
    apiClient.post<WithdrawTransaction>('/api/v1/warehouse/withdraw', body).then(r => r.data),

  confirmHandshake: (id: string, issuerId: string) =>
    apiClient.patch<WithdrawTransaction>(`/api/v1/warehouse/withdraw/${id}/handshake`, { issuerId }).then(r => r.data),

  listWithdraws: (params?: { woId?: string; status?: string; limit?: number }) =>
    apiClient.get<WithdrawTransaction[]>('/api/v1/warehouse/withdraw', { params }).then(r => r.data),

  listReceives: (params?: { syncStatus?: string; limit?: number }) =>
    apiClient.get<ReceiveListRow[]>('/api/v1/warehouse/receive', { params }).then(r => r.data),

  listPurchaseOrders: (params?: { poRef?: string; vendor?: string; product?: string; status?: string }) =>
    apiClient.get<PurchaseOrderListResponse>('/api/v1/warehouse/po', { params }).then(r => r.data),

  getPurchaseOrderLines: (poId: string) =>
    apiClient.get<PurchaseOrderLine[]>(`/api/v1/warehouse/po/${poId}/lines`).then(r => r.data),

  syncPurchaseOrders: () =>
    apiClient.post<{ meta: PurchaseOrderListResponse['meta']; count: number }>(
      '/api/v1/warehouse/po/sync',
    ).then(r => r.data),

  listItems: (params?: { search?: string; limit?: number }) =>
    apiClient.get<ItemListRow[]>('/api/v1/warehouse/items', { params }).then(r => r.data),

  listEmployees: () =>
    apiClient.get<EmployeeListRow[]>('/api/v1/warehouse/employees').then(r => r.data),

  createReceive: (body: CreateReceiveInput) =>
    apiClient.post<ReceiveTransaction>('/api/v1/warehouse/receive', body).then(r => r.data),

  getStock: (params?: { warehouseId?: string; search?: string }) =>
    apiClient.get<StockPosition[]>('/api/v1/warehouse/stock', { params }).then(r => r.data),

  getItemStock: (itemId: string) =>
    apiClient.get<StockPosition[]>(`/api/v1/warehouse/stock/${itemId}`).then(r => r.data),

  openCycleCount: (warehouseIds: string[], startedById: string) =>
    apiClient.post<CycleCountSession>('/api/v1/warehouse/cycle-count/session', { warehouseIds, startedById }).then(r => r.data),

  reconcile: (
    sessionId: string,
    lines: Array<{ itemId: string; warehouseId: string; countedQty: number; varianceReason?: string }>,
    reconciledById: string,
  ) =>
    apiClient.patch<CycleCountSession>(`/api/v1/warehouse/cycle-count/session/${sessionId}/reconcile`, { lines, reconciledById }).then(r => r.data),
}

// ─── Reports API ───────────────────────────────────────────────

export const reportsApi = {
  getDashboard: () =>
    apiClient.get<DashboardKPI>('/api/v1/reports/dashboard').then(r => r.data),

  getMachineABC: () =>
    apiClient.get<MachineABCEntry[]>('/api/v1/reports/machine-abc').then(r => r.data),

  getFraudAlerts: () =>
    apiClient.get<FraudAlert[]>('/api/v1/reports/fraud-alerts').then(r => r.data),

  getProjectCost: () =>
    apiClient.get<ProjectCostBreakdown[]>('/api/v1/reports/project-cost').then(r => r.data),
}

// ─── Sync API ──────────────────────────────────────────────────

export const syncApi = {
  pushEvent: (id: string, type: string, payload: unknown) =>
    apiClient.post('/api/v1/sync', { id, type, payload }).then(r => r.data),

  getStatus: () =>
    apiClient.get<SyncStatusResponse>('/api/v1/sync/status').then(r => r.data),
}

// ─── Audit API ─────────────────────────────────────────────────

export const auditApi = {
  getRecent: (limit = 50) =>
    apiClient.get<AuditLog[]>('/api/v1/audit', { params: { limit } }).then(r => r.data),
}
