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
