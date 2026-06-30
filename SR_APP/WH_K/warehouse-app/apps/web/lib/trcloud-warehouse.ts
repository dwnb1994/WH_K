import grData from '../../api/data/gr.json'
import incData from '../../api/data/inc.json'
import mrData from '../../api/data/mr.json'
import stockSimulationData from '../../api/data/stock-simulation.json'

export type DocType = 'GR' | 'INC' | 'MR'

// ─── Warehouse selection ──────────────────────────────────────
// คลังในข้อมูลใช้รูปแบบ "<CODE>_<ชื่อไทย>" เช่น TN_คลังเซโปน, LW_คลังเซ...
// code คือ prefix หน้า "_" — ใช้กรองทุกหน้าได้
export type WarehouseCode = 'ALL' | 'LW' | 'PX' | 'TN'

export const WAREHOUSES: Array<{ code: WarehouseCode; label: string }> = [
  { code: 'ALL', label: 'ทุกคลัง' },
  { code: 'LW', label: 'LW' },
  { code: 'PX', label: 'PX' },
  { code: 'TN', label: 'TN · เซโปน' },
]

export function matchWarehouse(warehouse: string, code: WarehouseCode) {
  if (code === 'ALL') return true
  const wh = warehouse.trim()
  return wh === code || wh.startsWith(`${code}_`) || wh.startsWith(`${code} `)
}

type RawOrder = Record<string, unknown>
type RawLine = Record<string, unknown>
type RawSnapshot = {
  fetched_at?: string
  date_from?: string
  date_to?: string
  orders?: RawOrder[]
  lines?: RawLine[]
}

export type WarehouseDoc = {
  docType: DocType
  docId: string
  docRef: string
  date: string
  partner: string
  requester: string
  warehouse: string
  department: string
  project: string
  status: string
  lineCount: number
  totalQty: number
  products: string[]
}

export type WarehouseLine = {
  docType: DocType
  docId: string
  docRef: string
  date: string
  productId: string
  productName: string
  warehouse: string
  quantity: number
  unit: string
  project: string
  department: string
}

export type StockRow = {
  key: string
  productId: string
  productName: string
  warehouse: string
  unit: string
  inboundQty: number
  outboundQty: number
  balanceQty: number
  movementCount: number
  lastDate: string
}

export type SimulatedStockRow = StockRow & {
  baseQty: number
}

export type DailyStockChange = {
  date: string
  inboundQty: number
  outboundQty: number
  netQty: number
  closingQty: number
  movementCount: number
  skuCount: number
  warehouseCount: number
}

type SimulatedStockMovement = {
  docType: DocType
  direction: 'in' | 'out'
  docRef: string
  date: string
  productId: string
  productName: string
  warehouse: string
  unit: string
  quantity: number
}

const SNAPSHOTS: Record<DocType, RawSnapshot> = {
  GR: grData as RawSnapshot,
  INC: incData as RawSnapshot,
  MR: mrData as RawSnapshot,
}

type StockSimulationSnapshot = {
  generated_at: string
  source: string
  bucket: string | null
  base: { date_to: string; qty: number; position_count: number }
  period: { date_from: string; date_to: string }
  source_counts: { baseLines: number; movementLines: number; skippedLines: number }
  snapshots: Record<string, { fetchedAt: string | null; dateFrom: string | null; dateTo: string | null; orders: number; lines: number }>
  rows: SimulatedStockRow[]
  movements: SimulatedStockMovement[]
  daily: DailyStockChange[]
}

const STOCK_SIMULATION = stockSimulationData as unknown as StockSimulationSnapshot

export const GCS_DOC_URLS: Record<DocType | 'MANIFEST', string> = {
  GR: 'https://console.cloud.google.com/storage/browser/_details/kitchen-sepon-data/trcloud/snapshots/gr/latest.json?project=whtdk-500801',
  INC: 'https://console.cloud.google.com/storage/browser/_details/kitchen-sepon-data/trcloud/snapshots/inc/latest.json?project=whtdk-500801',
  MR: 'https://console.cloud.google.com/storage/browser/_details/kitchen-sepon-data/trcloud/snapshots/mr/latest.json?project=whtdk-500801',
  MANIFEST: 'https://console.cloud.google.com/storage/browser/_details/kitchen-sepon-data/trcloud/manifests/latest.json?project=whtdk-500801',
}

export function todayBangkok() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function snapshotMeta(docType: DocType) {
  const s = SNAPSHOTS[docType]
  return {
    fetchedAt: String(s.fetched_at ?? ''),
    dateFrom: String(s.date_from ?? ''),
    dateTo: String(s.date_to ?? ''),
    orderCount: s.orders?.length ?? 0,
    lineCount: s.lines?.length ?? 0,
  }
}

function text(value: unknown) {
  return value == null ? '' : String(value)
}

function number(value: unknown) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function compactProducts(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(x => text(x)).filter(Boolean))).slice(0, 4)
    : []
}

function orderIdField(docType: DocType) {
  if (docType === 'GR') return 'receive_id'
  if (docType === 'INC') return 'document_id'
  return 'mr_id'
}

function lineDate(line: RawLine, order?: RawOrder) {
  return text(line.date ?? line.issue_date ?? order?.issue_date)
}

function inRange(date: string, from: string, to: string) {
  if (!date) return false
  const d = date.slice(0, 10)
  return d >= from && d <= to
}

function toDoc(docType: DocType, order: RawOrder, linesByDoc: Map<string, RawLine[]>): WarehouseDoc {
  const idField = orderIdField(docType)
  const docId = text(order[idField])
  const lines = linesByDoc.get(docId) ?? []
  return {
    docType,
    docId,
    docRef: text(order.doc_ref || order.document_number),
    date: text(order.issue_date || order.date),
    partner: text(order.supplier_name || order.organization || order.name || order.client_name),
    requester: text(order.request_by || order.create_by),
    warehouse: text(order.warehouse || lines[0]?.warehouse),
    department: text(order.department),
    project: text(order.project),
    status: text(order.status || order.approve_status),
    lineCount: number(order.line_count || lines.length),
    totalQty: lines.reduce((sum, line) => sum + number(line.quantity), 0),
    products: compactProducts(order.products),
  }
}

function toLine(docType: DocType, line: RawLine, order?: RawOrder): WarehouseLine {
  const idField = orderIdField(docType)
  const docId = text(line[idField] ?? order?.[idField])
  return {
    docType,
    docId,
    docRef: text(line.doc_ref || order?.doc_ref || line.document_number || order?.document_number),
    date: lineDate(line, order),
    productId: text(line.product_id),
    productName: text(line.product_name || line.product || line.description),
    warehouse: text(line.warehouse || order?.warehouse),
    quantity: number(line.quantity),
    unit: text(line.unit),
    project: text(line.project || order?.project),
    department: text(line.department || order?.department),
  }
}

function linesByDoc(docType: DocType) {
  const snap = SNAPSHOTS[docType]
  const idField = orderIdField(docType)
  const map = new Map<string, RawLine[]>()
  for (const line of snap.lines ?? []) {
    const id = text(line[idField])
    if (!id) continue
    const bucket = map.get(id) ?? []
    bucket.push(line)
    map.set(id, bucket)
  }
  return map
}

function orderById(docType: DocType) {
  const snap = SNAPSHOTS[docType]
  const idField = orderIdField(docType)
  const map = new Map<string, RawOrder>()
  for (const order of snap.orders ?? []) {
    const id = text(order[idField])
    if (id) map.set(id, order)
  }
  return map
}

export function getDocs(docTypes: DocType[], from: string, to: string, search = '', warehouse: WarehouseCode = 'ALL') {
  const q = search.trim().toLowerCase()
  return docTypes.flatMap(docType => {
    const map = linesByDoc(docType)
    return (SNAPSHOTS[docType].orders ?? []).map(order => toDoc(docType, order, map))
  })
    .filter(doc => inRange(doc.date, from, to))
    .filter(doc => matchWarehouse(doc.warehouse, warehouse))
    .filter(doc => {
      if (!q) return true
      return [
        doc.docRef,
        doc.partner,
        doc.requester,
        doc.warehouse,
        doc.project,
        ...doc.products,
      ].join(' ').toLowerCase().includes(q)
    })
    .sort((a, b) => `${b.date}${b.docRef}`.localeCompare(`${a.date}${a.docRef}`))
}

export function getLines(docTypes: DocType[], from: string, to: string, search = '', warehouse: WarehouseCode = 'ALL') {
  const q = search.trim().toLowerCase()
  return docTypes.flatMap(docType => {
    const orders = orderById(docType)
    const idField = orderIdField(docType)
    return (SNAPSHOTS[docType].lines ?? []).map(line => toLine(docType, line, orders.get(text(line[idField]))))
  })
    .filter(line => inRange(line.date, from, to))
    .filter(line => matchWarehouse(line.warehouse, warehouse))
    .filter(line => {
      if (!q) return true
      return [
        line.docRef,
        line.productId,
        line.productName,
        line.warehouse,
        line.project,
      ].join(' ').toLowerCase().includes(q)
    })
}

export function summarizeByWarehouse(lines: WarehouseLine[]) {
  const map = new Map<string, { warehouse: string; qty: number; lineCount: number; docRefs: Set<string> }>()
  for (const line of lines) {
    const wh = line.warehouse || 'ไม่ระบุคลัง'
    const row = map.get(wh) ?? { warehouse: wh, qty: 0, lineCount: 0, docRefs: new Set<string>() }
    row.qty += line.quantity
    row.lineCount += 1
    row.docRefs.add(line.docRef)
    map.set(wh, row)
  }
  return Array.from(map.values())
    .map(row => ({ ...row, docCount: row.docRefs.size }))
    .sort((a, b) => b.qty - a.qty)
}

export function buildStockRows(from: string, to: string, search = ''): StockRow[] {
  const inbound = getLines(['GR', 'INC'], from, to)
  const outbound = getLines(['MR'], from, to)
  const rows = new Map<string, StockRow>()

  const touch = (line: WarehouseLine) => {
    const productId = line.productId || 'NO-SKU'
    const warehouse = line.warehouse || 'ไม่ระบุคลัง'
    const key = `${warehouse}::${productId}`
    const row = rows.get(key) ?? {
      key,
      productId,
      productName: line.productName || '-',
      warehouse,
      unit: line.unit,
      inboundQty: 0,
      outboundQty: 0,
      balanceQty: 0,
      movementCount: 0,
      lastDate: '',
    }
    if (line.productName) row.productName = line.productName
    if (line.unit) row.unit = line.unit
    row.movementCount += 1
    row.lastDate = row.lastDate > line.date ? row.lastDate : line.date
    rows.set(key, row)
    return row
  }

  for (const line of inbound) touch(line).inboundQty += line.quantity
  for (const line of outbound) touch(line).outboundQty += line.quantity

  const q = search.trim().toLowerCase()
  return Array.from(rows.values())
    .map(row => ({ ...row, balanceQty: row.inboundQty - row.outboundQty }))
    .filter(row => {
      if (!q) return true
      return [row.productId, row.productName, row.warehouse].join(' ').toLowerCase().includes(q)
    })
    .sort((a, b) => a.warehouse.localeCompare(b.warehouse) || a.productId.localeCompare(b.productId))
}

export function stockSimulationMeta() {
  return {
    generatedAt: STOCK_SIMULATION.generated_at,
    source: STOCK_SIMULATION.source,
    bucket: STOCK_SIMULATION.bucket,
    base: STOCK_SIMULATION.base,
    period: STOCK_SIMULATION.period,
    sourceCounts: STOCK_SIMULATION.source_counts,
    snapshots: STOCK_SIMULATION.snapshots,
  }
}

export function buildSimulatedStockRows(from: string, to: string, search = '', warehouseCode: WarehouseCode = 'ALL'): SimulatedStockRow[] {
  const rows = new Map<string, SimulatedStockRow>()

  for (const row of STOCK_SIMULATION.rows) {
    if (!matchWarehouse(row.warehouse, warehouseCode)) continue
    rows.set(row.key, {
      key: row.key,
      productId: row.productId,
      productName: row.productName,
      warehouse: row.warehouse,
      unit: row.unit,
      baseQty: number(row.baseQty),
      inboundQty: 0,
      outboundQty: 0,
      balanceQty: number(row.baseQty),
      movementCount: 0,
      lastDate: '',
    })
  }

  for (const movement of STOCK_SIMULATION.movements) {
    if (!inRange(movement.date, from, to)) continue
    if (!matchWarehouse(movement.warehouse, warehouseCode)) continue
    const productId = movement.productId || 'NO-SKU'
    const warehouse = movement.warehouse || 'ไม่ระบุคลัง'
    const key = `${warehouse}::${productId}`
    const row = rows.get(key) ?? {
      key,
      productId,
      productName: movement.productName || '-',
      warehouse,
      unit: movement.unit,
      baseQty: 0,
      inboundQty: 0,
      outboundQty: 0,
      balanceQty: 0,
      movementCount: 0,
      lastDate: '',
    }

    if (movement.productName) row.productName = movement.productName
    if (movement.unit) row.unit = movement.unit
    if (movement.direction === 'in') row.inboundQty += movement.quantity
    else row.outboundQty += movement.quantity
    row.movementCount += 1
    row.lastDate = row.lastDate > movement.date ? row.lastDate : movement.date
    rows.set(key, row)
  }

  const q = search.trim().toLowerCase()
  return Array.from(rows.values())
    .map(row => ({
      ...row,
      baseQty: Math.round(row.baseQty * 1000) / 1000,
      inboundQty: Math.round(row.inboundQty * 1000) / 1000,
      outboundQty: Math.round(row.outboundQty * 1000) / 1000,
      balanceQty: Math.round((row.baseQty + row.inboundQty - row.outboundQty) * 1000) / 1000,
    }))
    .filter(row => {
      if (!q) return true
      return [row.productId, row.productName, row.warehouse].join(' ').toLowerCase().includes(q)
    })
    .sort((a, b) => a.warehouse.localeCompare(b.warehouse) || a.productId.localeCompare(b.productId))
}

export function getDailyStockChanges(from: string, to: string, warehouse: WarehouseCode = 'ALL') {
  // ALL: ใช้ daily ที่ pre-aggregate ไว้ (เร็ว ตรงกับพฤติกรรมเดิม)
  if (warehouse === 'ALL') {
    return STOCK_SIMULATION.daily.filter(day => inRange(day.date, from, to))
  }

  // คลังเฉพาะ: คำนวณใหม่จาก movements ของคลังนั้น
  // closing = ฐานของคลัง + ผลรวม net สะสมทุกวัน (all-time) แล้วค่อย emit เฉพาะวันที่อยู่ในช่วง
  const base = STOCK_SIMULATION.rows
    .filter(row => matchWarehouse(row.warehouse, warehouse))
    .reduce((sum, row) => sum + number(row.baseQty), 0)

  const byDate = new Map<string, { inboundQty: number; outboundQty: number; movementCount: number; skus: Set<string> }>()
  for (const movement of STOCK_SIMULATION.movements) {
    if (!matchWarehouse(movement.warehouse, warehouse)) continue
    const date = text(movement.date).slice(0, 10)
    if (!date) continue
    const row = byDate.get(date) ?? { inboundQty: 0, outboundQty: 0, movementCount: 0, skus: new Set<string>() }
    if (movement.direction === 'in') row.inboundQty += movement.quantity
    else row.outboundQty += movement.quantity
    row.movementCount += 1
    if (movement.productId) row.skus.add(movement.productId)
    byDate.set(date, row)
  }

  const round = (n: number) => Math.round(n * 1000) / 1000
  let closing = base
  const result: DailyStockChange[] = []
  for (const date of Array.from(byDate.keys()).sort()) {
    const row = byDate.get(date)!
    const net = row.inboundQty - row.outboundQty
    closing += net
    if (inRange(date, from, to)) {
      result.push({
        date,
        inboundQty: round(row.inboundQty),
        outboundQty: round(row.outboundQty),
        netQty: round(net),
        closingQty: round(closing),
        movementCount: row.movementCount,
        skuCount: row.skus.size,
        warehouseCount: 1,
      })
    }
  }
  return result
}

export function docsSummary(docs: WarehouseDoc[], lines: WarehouseLine[]) {
  return {
    docCount: docs.length,
    lineCount: lines.length,
    qty: lines.reduce((sum, line) => sum + line.quantity, 0),
    skuCount: new Set(lines.map(line => line.productId).filter(Boolean)).size,
    warehouseCount: new Set(lines.map(line => line.warehouse).filter(Boolean)).size,
  }
}
