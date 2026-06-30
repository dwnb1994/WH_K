import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateWithdrawInput, CreateReceiveInput } from '@warehouse/validators'
import { warehouseApi, reportsApi, syncApi } from './index'
import { fetchOrMock } from './demo'
import {
  MOCK_DASHBOARD, MOCK_MACHINE_ABC, MOCK_FRAUD, MOCK_PROJECT_COST,
  MOCK_RECEIVES, MOCK_WITHDRAWS, MOCK_EMPLOYEES, MOCK_SYNC,
  filterMockStock, filterMockItems, filterMockReceives,
} from './mock-data'

// ─── Query keys ────────────────────────────────────────────────

export const QK = {
  stock:       (wh?: string) => ['stock', wh] as const,
  withdraws:   (params?: object) => ['withdraws', params] as const,
  dashboard:   () => ['dashboard'] as const,
  machineABC:  () => ['machineABC'] as const,
  fraudAlerts: () => ['fraudAlerts'] as const,
  projectCost: () => ['projectCost'] as const,
  receives:    (params?: object) => ['receives', params] as const,
  purchaseOrders: (params?: object) => ['purchaseOrders', params] as const,
  poLines:       (poId?: string | null) => ['poLines', poId] as const,
  goodsReceipts: (params?: object) => ['goodsReceipts', params] as const,
  grLines:       (id?: string | null) => ['grLines', id] as const,
  materialRequests: (params?: object) => ['materialRequests', params] as const,
  mrLines:       (id?: string | null) => ['mrLines', id] as const,
  inboundCargo:  (params?: object) => ['inboundCargo', params] as const,
  incLines:      (id?: string | null) => ['incLines', id] as const,
  incStock:      (params?: object) => ['incStock', params] as const,
  items:       (search?: string) => ['items', search] as const,
  employees:   () => ['employees'] as const,
  syncStatus:  () => ['syncStatus'] as const,
}

// ─── Stock hooks ───────────────────────────────────────────────

export function useStock(warehouseId?: string, search?: string) {
  return useQuery({
    queryKey: QK.stock(warehouseId),
    queryFn: () => fetchOrMock(
      () => warehouseApi.getStock({ warehouseId, search }),
      filterMockStock(search),
    ),
    staleTime: 30_000,
  })
}

// ─── Withdraw hooks ────────────────────────────────────────────

export function useWithdraws(params?: { woId?: string; status?: string; limit?: number }) {
  return useQuery({
    queryKey: QK.withdraws(params),
    queryFn: () => fetchOrMock(
      () => warehouseApi.listWithdraws(params),
      MOCK_WITHDRAWS.slice(0, params?.limit ?? 50) as Awaited<ReturnType<typeof warehouseApi.listWithdraws>>,
    ),
  })
}

export function useCreateWithdraw() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateWithdrawInput) => warehouseApi.createWithdraw(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.stock() }),
  })
}

export function useConfirmHandshake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, issuerId }: { id: string; issuerId: string }) =>
      warehouseApi.confirmHandshake(id, issuerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.stock() })
      qc.invalidateQueries({ queryKey: QK.withdraws() })
    },
  })
}

// ─── Receive hooks ─────────────────────────────────────────────

export function useCreateReceive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateReceiveInput) => warehouseApi.createReceive(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.stock() }),
  })
}

// ─── Dashboard hooks ───────────────────────────────────────────

export function useDashboardKPI() {
  return useQuery({
    queryKey: QK.dashboard(),
    queryFn: () => fetchOrMock(() => reportsApi.getDashboard(), MOCK_DASHBOARD),
    staleTime: 60_000,
  })
}

export function useMachineABC() {
  return useQuery({
    queryKey: QK.machineABC(),
    queryFn: () => fetchOrMock(() => reportsApi.getMachineABC(), MOCK_MACHINE_ABC),
    staleTime: 60_000,
  })
}

export function useFraudAlerts() {
  return useQuery({
    queryKey: QK.fraudAlerts(),
    queryFn: () => fetchOrMock(() => reportsApi.getFraudAlerts(), MOCK_FRAUD),
    staleTime: 30_000,
  })
}

export function useProjectCost() {
  return useQuery({
    queryKey: QK.projectCost(),
    queryFn: () => fetchOrMock(() => reportsApi.getProjectCost(), MOCK_PROJECT_COST),
    staleTime: 60_000,
  })
}

export function useReceives(params?: { syncStatus?: string; limit?: number }) {
  return useQuery({
    queryKey: QK.receives(params),
    queryFn: () => fetchOrMock(
      () => warehouseApi.listReceives(params),
      filterMockReceives(params?.syncStatus).slice(0, params?.limit ?? 50),
    ),
  })
}

/** PO จาก TRCloud — ไม่ใช้ mock ดึงจาก API จริงเสมอ */
export function usePurchaseOrders(params?: { poRef?: string; vendor?: string; product?: string; status?: string }) {
  return useQuery({
    queryKey: QK.purchaseOrders(params),
    queryFn: () => warehouseApi.listPurchaseOrders(params),
    staleTime: 60_000,
  })
}

export function usePurchaseOrderLines(poId: string | null) {
  return useQuery({
    queryKey: QK.poLines(poId),
    queryFn: () => warehouseApi.getPurchaseOrderLines(poId!),
    enabled: !!poId,
    staleTime: 5 * 60_000,
  })
}

export function useSyncPurchaseOrders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => warehouseApi.syncPurchaseOrders(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchaseOrders'] }),
  })
}

export function useGoodsReceipts(params?: { docRef?: string; vendor?: string; product?: string; status?: string; limit?: number }) {
  return useQuery({
    queryKey: QK.goodsReceipts(params),
    queryFn: () => warehouseApi.listGoodsReceipts(params),
    staleTime: 60_000,
  })
}

export function useGoodsReceiptLines(receiveId: string | null) {
  return useQuery({
    queryKey: QK.grLines(receiveId),
    queryFn: () => warehouseApi.getGoodsReceiptLines(receiveId!),
    enabled: !!receiveId,
    staleTime: 5 * 60_000,
  })
}

export function useMaterialRequests(params?: { docRef?: string; vendor?: string; product?: string; status?: string; limit?: number }) {
  return useQuery({
    queryKey: QK.materialRequests(params),
    queryFn: () => warehouseApi.listMaterialRequests(params),
    staleTime: 60_000,
  })
}

export function useMaterialRequestLines(mrId: string | null) {
  return useQuery({
    queryKey: QK.mrLines(mrId),
    queryFn: () => warehouseApi.getMaterialRequestLines(mrId!),
    enabled: !!mrId,
    staleTime: 5 * 60_000,
  })
}

export function useInboundCargo(params?: { docRef?: string; vendor?: string; product?: string; status?: string; limit?: number }) {
  return useQuery({
    queryKey: QK.inboundCargo(params),
    queryFn: () => warehouseApi.listInboundCargo(params),
    staleTime: 60_000,
  })
}

export function useInboundCargoLines(documentId: string | null) {
  return useQuery({
    queryKey: QK.incLines(documentId),
    queryFn: () => warehouseApi.getInboundCargoLines(documentId!),
    enabled: !!documentId,
    staleTime: 5 * 60_000,
  })
}

export function useIncStock(params?: { search?: string; limit?: number }) {
  return useQuery({
    queryKey: QK.incStock(params),
    queryFn: () => warehouseApi.getIncStock(params),
    staleTime: 60_000,
  })
}

export function useReloadTrCloudDocs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (kind?: 'gr' | 'mr' | 'inc') => warehouseApi.reloadTrCloudDocs(kind),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goodsReceipts'] })
      qc.invalidateQueries({ queryKey: ['materialRequests'] })
      qc.invalidateQueries({ queryKey: ['inboundCargo'] })
      qc.invalidateQueries({ queryKey: ['grLines'] })
      qc.invalidateQueries({ queryKey: ['mrLines'] })
      qc.invalidateQueries({ queryKey: ['incLines'] })
      qc.invalidateQueries({ queryKey: ['incStock'] })
    },
  })
}

export function useItems(search?: string) {
  return useQuery({
    queryKey: QK.items(search),
    queryFn: () => fetchOrMock(
      () => warehouseApi.listItems({ search, limit: 100 }),
      filterMockItems(search),
    ),
  })
}

export function useEmployees() {
  return useQuery({
    queryKey: QK.employees(),
    queryFn: () => fetchOrMock(() => warehouseApi.listEmployees(), MOCK_EMPLOYEES),
  })
}

export function useSyncStatus() {
  return useQuery({
    queryKey: QK.syncStatus(),
    queryFn: () => fetchOrMock(() => syncApi.getStatus(), MOCK_SYNC),
    refetchInterval: 30_000,
  })
}
