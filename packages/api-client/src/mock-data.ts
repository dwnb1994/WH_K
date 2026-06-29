/**
 * ข้อมูลตัวอย่างสำหรับ demo — ใช้เมื่อ NEXT_PUBLIC_USE_MOCK=1
 */
import type {
  DashboardKPI, MachineABCEntry, FraudAlert, ProjectCostBreakdown,
  WithdrawTransaction, StockPosition,
} from '@warehouse/types'
import type {
  ReceiveListRow, ItemListRow, EmployeeListRow, SyncStatusResponse,
} from './index'

export const MOCK_RECEIVES: ReceiveListRow[] = [
  { id: '1', offline_id: 'rx-001', po_ref: 'PO-2406-018', supplier_name: 'บจก. สยามฮาร์ดแวร์', warehouse_id: 'wh-1', sync_status: 'PENDING', total_value: 312000, created_at: '2026-06-19T06:42:00Z', employees: { name: 'สมชาย ใจดี', code: 'EMP-1042' } },
  { id: '2', offline_id: 'rx-002', po_ref: 'PO-2406-019', supplier_name: 'บจก. โลหะภัณฑ์ไทย', warehouse_id: 'wh-1', sync_status: 'SYNCED', total_value: 185500, created_at: '2026-06-19T05:30:00Z', employees: { name: 'วิชัย รักงาน', code: 'EMP-1038' } },
  { id: '3', offline_id: 'rx-003', po_ref: 'PO-2406-017', supplier_name: 'บจก. โตโยเครื่องมือ', warehouse_id: 'wh-1', sync_status: 'SYNCED', total_value: 428000, created_at: '2026-06-18T03:22:00Z', employees: { name: 'สมชาย ใจดี', code: 'EMP-1042' } },
  { id: '4', offline_id: 'rx-004', po_ref: 'PO-2406-016', supplier_name: 'หจก. ช่างทองวัสดุ', warehouse_id: 'wh-1', sync_status: 'ERROR', total_value: 96000, created_at: '2026-06-17T07:08:00Z', employees: { name: 'ประเสริฐ มั่นคง', code: 'EMP-1021' } },
]

export type MockWithdrawRow = WithdrawTransaction & {
  mr_ref?: string
  work_orders?: { wo_number: string; project: string }
  employees?: { name: string }
}

export const MOCK_WITHDRAWS: MockWithdrawRow[] = [
  { id: 'w1', offlineId: 'wd-001', woId: 'wo-1', requesterId: 'e4', mr_ref: 'MR-2406-204', handshakeStatus: 'COMPLETE', syncStatus: 'PENDING', totalCost: 38400, softBlocked: false, createdAt: '2026-06-19T06:51:00Z', lines: [], work_orders: { wo_number: 'WO-SE-1042', project: 'โครงการ Sepon' }, employees: { name: 'อนุชา ขยัน' } },
  { id: 'w2', offlineId: 'wd-002', woId: 'wo-2', requesterId: 'e4', mr_ref: 'MR-2406-203', handshakeStatus: 'COMPLETE', syncStatus: 'SYNCED', totalCost: 72100, softBlocked: false, createdAt: '2026-06-19T05:08:00Z', lines: [], work_orders: { wo_number: 'WO-SE-1038', project: 'โครงการ Sepon' }, employees: { name: 'สมหญิง ดีใจ' } },
  { id: 'w3', offlineId: 'wd-003', woId: 'wo-3', requesterId: 'e4', mr_ref: 'MR-2406-205', handshakeStatus: 'PENDING', syncStatus: 'PENDING', totalCost: 15800, softBlocked: false, createdAt: '2026-06-19T04:00:00Z', lines: [], work_orders: { wo_number: 'WO-DC-021', project: 'ซ่อมบำรุง DC-BKK' }, employees: { name: 'วิชัย รักงาน' } },
  { id: 'w4', offlineId: 'wd-004', woId: 'wo-4', requesterId: 'e4', mr_ref: 'MR-2406-201', handshakeStatus: 'COMPLETE', syncStatus: 'ERROR', totalCost: 22400, softBlocked: true, createdAt: '2026-06-19T03:15:00Z', lines: [], work_orders: { wo_number: 'WO-SE-1021', project: 'โครงการ Sepon' }, employees: { name: 'ประเสริฐ มั่นคง' } },
]

export const MOCK_STOCK: StockPosition[] = [
  { id: 's1', itemId: 'i1', warehouseId: 'wh-1', binCode: 'A-13', onHand: 248, reserved: 12, available: 236, item: { id: 'i1', sku: 'FX-1180', name: 'น็อตหัวจม M8 × 40', unit: 'กล่อง', category: 'ฮาร์ดแวร์', minQty: 50, createdAt: '', updatedAt: '' }, warehouse: { id: 'wh-1', code: 'A', name: 'คลัง A' } },
  { id: 's2', itemId: 'i2', warehouseId: 'wh-1', binCode: 'A-01', onHand: 34, reserved: 4, available: 30, item: { id: 'i2', sku: 'TL-0241', name: 'สว่านไร้สาย 18V พร้อมแบต', unit: 'เครื่อง', category: 'เครื่องมือไฟฟ้า', minQty: 10, createdAt: '', updatedAt: '' }, warehouse: { id: 'wh-1', code: 'A', name: 'คลัง A' } },
  { id: 's3', itemId: 'i3', warehouseId: 'wh-1', binCode: 'A-13', onHand: 12, reserved: 0, available: 12, item: { id: 'i3', sku: 'FX-1182', name: 'น็อตหัวจม M10 × 50', unit: 'กล่อง', category: 'ฮาร์ดแวร์', minQty: 50, createdAt: '', updatedAt: '' }, warehouse: { id: 'wh-1', code: 'A', name: 'คลัง A' } },
  { id: 's4', itemId: 'i4', warehouseId: 'wh-1', binCode: 'B-20', onHand: 21, reserved: 2, available: 19, item: { id: 'i4', sku: 'TL-0118', name: 'ไขควงไฟฟ้า 12V', unit: 'เครื่อง', category: 'เครื่องมือไฟฟ้า', minQty: 8, createdAt: '', updatedAt: '' }, warehouse: { id: 'wh-1', code: 'B', name: 'คลัง B' } },
  { id: 's5', itemId: 'i5', warehouseId: 'wh-1', binCode: 'A-05', onHand: 0, reserved: 0, available: 0, item: { id: 'i5', sku: 'FX-3310', name: 'น็อตล็อค M8 ไนล่อน', unit: 'ชิ้น', category: 'ฮาร์ดแวร์', minQty: 300, createdAt: '', updatedAt: '' }, warehouse: { id: 'wh-1', code: 'A', name: 'คลัง A' } },
  { id: 's6', itemId: 'i6', warehouseId: 'wh-1', binCode: 'B-20', onHand: 58, reserved: 0, available: 58, item: { id: 'i6', sku: 'TL-0902', name: 'ดอกสว่าน HSS ชุด 19 ดอก', unit: 'ชุด', category: 'เครื่องมือไฟฟ้า', minQty: 15, createdAt: '', updatedAt: '' }, warehouse: { id: 'wh-1', code: 'B', name: 'คลัง B' } },
]

export const MOCK_ITEMS: ItemListRow[] = [
  { id: 'i1', sku: 'FX-1180', name: 'น็อตหัวจม M8 × 40', unit: 'กล่อง', category: 'ฮาร์ดแวร์', min_qty: 50, on_hand: 248, stock_status: 'OK' },
  { id: 'i3', sku: 'FX-1182', name: 'น็อตหัวจม M10 × 50', unit: 'กล่อง', category: 'ฮาร์ดแวร์', min_qty: 50, on_hand: 12, stock_status: 'LOW' },
  { id: 'i2', sku: 'TL-0241', name: 'สว่านไร้สาย 18V พร้อมแบต', unit: 'เครื่อง', category: 'เครื่องมือไฟฟ้า', min_qty: 10, on_hand: 34, stock_status: 'OK' },
  { id: 'i4', sku: 'TL-0118', name: 'ไขควงไฟฟ้า 12V', unit: 'เครื่อง', category: 'เครื่องมือไฟฟ้า', min_qty: 8, on_hand: 21, stock_status: 'OK' },
  { id: 'i7', sku: 'FX-2204', name: 'น็อตตัวเมีย M8', unit: 'ชิ้น', category: 'ฮาร์ดแวร์', min_qty: 500, on_hand: 1420, stock_status: 'OK' },
  { id: 'i5', sku: 'FX-3310', name: 'น็อตล็อค M8 ไนล่อน', unit: 'ชิ้น', category: 'ฮาร์ดแวร์', min_qty: 300, on_hand: 0, stock_status: 'LOW' },
  { id: 'i6', sku: 'TL-0902', name: 'ดอกสว่าน HSS ชุด 19 ดอก', unit: 'ชุด', category: 'เครื่องมือไฟฟ้า', min_qty: 15, on_hand: 58, stock_status: 'OK' },
]

export const MOCK_EMPLOYEES: EmployeeListRow[] = [
  { id: 'e1', code: 'EMP-1042', name: 'สมชาย ใจดี', role: 'WAREHOUSE_STAFF', active: true, warehouses: { code: 'DC-BKK', name: 'ศูนย์กระจาย BKK' } },
  { id: 'e2', code: 'EMP-1038', name: 'วิชัย รักงาน', role: 'WAREHOUSE_STAFF', active: true, warehouses: { code: 'DC-BKK', name: 'ศูนย์กระจาย BKK' } },
  { id: 'e3', code: 'EMP-1001', name: 'สุรชัย จัดการ', role: 'WAREHOUSE_MANAGER', active: true, warehouses: { code: 'DC-BKK', name: 'ศูนย์กระจาย BKK' } },
  { id: 'e4', code: 'EMP-2015', name: 'อนุชา ขยัน', role: 'REQUESTER', active: true, warehouses: null },
  { id: 'e5', code: 'EMP-3002', name: 'ประเสริฐ มั่นคง', role: 'SUPERVISOR', active: true, warehouses: { code: 'DC-BKK', name: 'ศูนย์กระจาย BKK' } },
]

export const MOCK_DASHBOARD: DashboardKPI = {
  monthlyWithdrawCost: 8420000,
  totalStockValue: 8420000,
  pendingSyncCount: 3,
  cycleVarianceValue: 12400,
  warehouseBreakdown: [
    { warehouseCode: 'A', value: 5200000 },
    { warehouseCode: 'B', value: 3220000 },
  ],
}

export const MOCK_MACHINE_ABC: MachineABCEntry[] = [
  { machineCode: 'EX-01', machineName: 'รถขุด CAT-320', totalCost: 284000, percentage: 38 },
  { machineCode: 'EX-02', machineName: 'รถขุด CAT-336', totalCost: 198000, percentage: 26 },
  { machineCode: 'CR-01', machineName: 'เครน 25T', totalCost: 142000, percentage: 19 },
  { machineCode: 'LD-01', machineName: 'รถตัก', totalCost: 98000, percentage: 13 },
]

export const MOCK_FRAUD: FraudAlert[] = [
  { type: 'ONE_SIDED_HANDSHAKE', count: 1, severity: 'HIGH' },
  { type: 'CROSS_PROJECT', count: 2, severity: 'LOW' },
  { type: 'ADJUST_NO_REASON', count: 0, severity: 'LOW' },
]

export const MOCK_PROJECT_COST: ProjectCostBreakdown[] = [
  { projectName: 'โครงการ Sepon', costCenterId: 'CC-SE', totalCost: 4200000, percentage: 52, color: '#2563EB' },
  { projectName: 'ซ่อมบำรุง DC-BKK', costCenterId: 'CC-DC', totalCost: 2100000, percentage: 26, color: '#7C3AED' },
  { projectName: 'โครงการทดลอง', costCenterId: 'CC-TD', totalCost: 1800000, percentage: 22, color: '#059669' },
]

export const MOCK_SYNC: SyncStatusResponse = {
  counts: { PENDING: 3, SYNCED: 124, ERROR: 1 },
  recent: [
    { id: 'sq1', type: 'GR', status: 'PENDING', retry_count: 0, error_message: null, created_at: '2026-06-19T06:42:00Z', synced_at: null },
    { id: 'sq2', type: 'GI', status: 'PENDING', retry_count: 0, error_message: null, created_at: '2026-06-19T06:51:00Z', synced_at: null },
    { id: 'sq3', type: 'GI', status: 'ERROR', retry_count: 3, error_message: 'TRCloud: MR-2406-201 SKU ไม่พบ', created_at: '2026-06-19T03:15:00Z', synced_at: null },
    { id: 'sq4', type: 'GI', status: 'SYNCED', retry_count: 0, error_message: null, created_at: '2026-06-19T05:08:00Z', synced_at: '2026-06-19T05:09:12Z' },
    { id: 'sq5', type: 'GR', status: 'SYNCED', retry_count: 0, error_message: null, created_at: '2026-06-18T03:22:00Z', synced_at: '2026-06-18T03:23:01Z' },
  ],
}

export function filterMockStock(search?: string): StockPosition[] {
  if (!search?.trim()) return MOCK_STOCK
  const q = search.toLowerCase()
  return MOCK_STOCK.filter(s =>
    s.item?.sku.toLowerCase().includes(q) ||
    s.item?.name.toLowerCase().includes(q),
  )
}

export function filterMockItems(search?: string): ItemListRow[] {
  if (!search?.trim()) return MOCK_ITEMS
  const q = search.toLowerCase()
  return MOCK_ITEMS.filter(i =>
    i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q),
  )
}

export function filterMockReceives(syncStatus?: string): ReceiveListRow[] {
  if (!syncStatus) return MOCK_RECEIVES
  return MOCK_RECEIVES.filter(r => r.sync_status === syncStatus)
}
