import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import { ERP_BASE, UA, getTrcloudCookie, clearTrcloudCookieCache } from './trcloud-auth.helper'

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
  document_number?: string
  product_id?: string
  product_name?: string
  description?: string
  quantity?: number
  unit?: string
  price?: number
  item_total?: number
  [key: string]: unknown
}

export interface PoJsonFile {
  fetched_at: string
  date_from: string
  date_to: string
  source: string
  count: number
  orders: PurchaseOrderRow[]
  lines: PurchaseOrderLine[]
}

const PO_LIST_URL = `${ERP_BASE}/application/expense/api/engine-po/po_search_keyword.php`
const PO_RETRIEVE_URL = `${ERP_BASE}/application/expense/api/engine-po/retrieve_po.php`

function formatPoRef(row: Record<string, unknown>): string {
  const cf = String(row.company_format ?? 'PO').trim()
  const num = String(
    row.document_number ?? row.invoice_number ?? row.doc_number ?? '',
  ).trim()
  if (!num) return cf
  const ref = `${cf}${num}`
  return ref.toUpperCase().startsWith('PO') ? ref : `PO${num}`
}

function stripHtml(raw: unknown): string {
  if (!raw) return ''
  return String(raw).replace(/<[^>]+>/g, '').trim()
}

@Injectable()
export class TRCloudPoService implements OnModuleInit {
  private readonly logger = new Logger(TRCloudPoService.name)
  private readonly jsonPath: string
  private cache: PoJsonFile | null = null

  constructor(private readonly config: ConfigService) {
    const rel = config.get('TRCLOUD_PO_JSON_PATH', './data/po.json')
    this.jsonPath = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel)
  }

  onModuleInit() {
    this.loadFromFile()
  }

  getMeta() {
    const c = this.cache
    return {
      fetched_at: c?.fetched_at ?? null,
      date_from: c?.date_from ?? this.config.get('TRCLOUD_PO_DATE_FROM', '2026-01-01'),
      date_to: c?.date_to ?? this.config.get('TRCLOUD_PO_DATE_TO', '2026-06-30'),
      count: c?.count ?? 0,
      source: c?.source ?? 'none',
    }
  }

  listPOs(params?: { poRef?: string; vendor?: string; product?: string; status?: string }): PurchaseOrderRow[] {
    let rows = this.cache?.orders ?? []
    const lines = this.cache?.lines ?? []

    if (params?.poRef) {
      const q = params.poRef.toLowerCase()
      rows = rows.filter(r => r.po_ref.toLowerCase().includes(q))
    }
    if (params?.vendor) {
      const q = params.vendor.toLowerCase()
      rows = rows.filter(r => r.supplier_name.toLowerCase().includes(q))
    }
    if (params?.product) {
      const q = params.product.toLowerCase()
      rows = rows.filter(r => {
        const names = r.products ?? []
        if (names.some(n => n.toLowerCase().includes(q))) return true
        return lines.some(
          l => String(l.po_id) === r.po_id &&
            String(l.product_name ?? l.description ?? '').toLowerCase().includes(q),
        )
      })
    }
    if (params?.status) {
      rows = rows.filter(r =>
        r.status.toLowerCase().includes(params.status!.toLowerCase()) ||
        r.approve_status.toLowerCase().includes(params.status!.toLowerCase()),
      )
    }
    return rows
  }

  async getPOLines(poId: string): Promise<PurchaseOrderLine[]> {
    const cached = (this.cache?.lines ?? []).filter(l => String(l.po_id) === String(poId))
    if (cached.length) return cached

    try {
      clearTrcloudCookieCache()
      const cookie = await getTrcloudCookie()
      const companyId = this.config.getOrThrow('TRCLOUD_COMPANY_ID')
      const passkey = this.config.getOrThrow('TRCLOUD_PASSKEY')
      const lines = await this.fetchPODetail(cookie, companyId, passkey, poId)

      if (lines.length && this.cache) {
        this.cache.lines = [...this.cache.lines.filter(l => String(l.po_id) !== String(poId)), ...lines]
        const order = this.cache.orders.find(o => o.po_id === String(poId))
        if (order) {
          order.line_count = lines.length
          order.products = lines.map(l => l.product_name ?? '').filter(Boolean)
        }
        this.saveToFile(this.cache)
      }
      return lines
    } catch (e) {
      this.logger.warn(`Live PO lines ${poId}: ${e}`)
      return []
    }
  }

  async syncFromTRCloud(): Promise<PoJsonFile> {
    this.logger.log('Syncing PO from TRCloud...')
    clearTrcloudCookieCache()
    const cookie = await getTrcloudCookie()
    const dateFrom = this.config.get('TRCLOUD_PO_DATE_FROM', '2026-01-01')
    const dateTo = this.config.get('TRCLOUD_PO_DATE_TO', '2026-06-30')
    const companyId = this.config.getOrThrow('TRCLOUD_COMPANY_ID')
    const passkey = this.config.getOrThrow('TRCLOUD_PASSKEY')
    const includeDetails = this.config.get('TRCLOUD_PO_INCLUDE_DETAILS', 'true') === 'true'

    const rawList = await this.fetchAllPO(cookie, companyId, passkey, dateFrom, dateTo)
    const orders = rawList.map(r => this.normalizeOrder(r))
    let lines: PurchaseOrderLine[] = []

    if (includeDetails) {
      let done = 0
      for (const po of rawList) {
        const pid = po.po_id ?? po.id
        if (!pid) continue
        try {
          const detail = await this.fetchPODetail(cookie, companyId, passkey, String(pid))
          lines.push(...detail)
        } catch (e) {
          this.logger.warn(`PO detail ${pid}: ${e}`)
        }
        done += 1
        if (done % 100 === 0) this.logger.log(`PO details ${done}/${rawList.length}`)
      }
    }

    for (const o of orders) {
      const matched = lines.filter(l => String(l.po_id) === o.po_id)
      o.line_count = matched.length
      o.products = matched.map(l => l.product_name ?? '').filter(Boolean)
    }

    const payload: PoJsonFile = {
      fetched_at: new Date().toISOString(),
      date_from: dateFrom,
      date_to: dateTo,
      source: 'trcloud-live',
      count: orders.length,
      orders,
      lines,
    }

    this.saveToFile(payload)
    this.cache = payload
    this.logger.log(`PO sync done: ${orders.length} orders, ${lines.length} lines`)
    return payload
  }

  private loadFromFile(): boolean {
    try {
      if (!fs.existsSync(this.jsonPath)) return false
      const raw = fs.readFileSync(this.jsonPath, 'utf-8')
      this.cache = JSON.parse(raw) as PoJsonFile
      this.applyPoRefPrefix(this.cache.orders)
      this.logger.log(`Loaded ${this.cache.count} PO from ${this.jsonPath}`)
      return true
    } catch (e) {
      this.logger.warn(`Cannot load PO JSON: ${e}`)
      return false
    }
  }

  private applyPoRefPrefix(orders: PurchaseOrderRow[]) {
    for (const o of orders) {
      if (o.po_ref && !o.po_ref.toUpperCase().startsWith('PO')) {
        o.po_ref = `PO${o.po_ref}`
      }
    }
  }

  private saveToFile(payload: PoJsonFile) {
    fs.mkdirSync(path.dirname(this.jsonPath), { recursive: true })
    fs.writeFileSync(this.jsonPath, JSON.stringify(payload, null, 2), 'utf-8')
  }

  private normalizeOrder(row: Record<string, unknown>): PurchaseOrderRow {
    const poId = String(row.po_id ?? row.id ?? '')
    return {
      po_id: poId,
      po_ref: formatPoRef(row),
      supplier_name: String(row.organization ?? row.name ?? '').trim(),
      issue_date: String(row.issue_date ?? ''),
      due_date: String(row.due_date ?? ''),
      grand_total: Number(row.grand_total ?? row.total ?? 0),
      status: String(row.status ?? ''),
      approve_status: String(row.approve_status ?? ''),
      payment: String(row.payment ?? ''),
      department: String(row.department ?? ''),
      project: String(row.project ?? ''),
      reference: String(row.reference ?? ''),
      line_count: 0,
      products: [],
    }
  }

  private baseListPayload(
    companyId: string, passkey: string, dateFrom: string, dateTo: string, page: number,
  ) {
    return {
      company_id: companyId,
      passkey,
      start: page,
      keyword: '',
      filter: '',
      from: dateFrom,
      to: dateTo,
      date_from: dateFrom,
      date_to: dateTo,
      activate_date: 'off',
      department: '',
      sort: '',
      advance_search: '1',
      project: '',
      staff: '',
      source: '',
      title: '',
      name: '',
      organization: '',
      tax_id: '',
      doc_from: '',
      doc_to: '',
      total_from: '',
      total_to: '',
      gtotal_from: '',
      gtotal_to: '',
      type: 'project',
    }
  }

  private async fetchAllPO(
    cookie: string, companyId: string, passkey: string, dateFrom: string, dateTo: string,
  ): Promise<Array<Record<string, unknown>>> {
    const records: Array<Record<string, unknown>> = []
    const seen = new Set<string>()
    let page = 0
    let total: number | null = null

    while (true) {
      const payload = this.baseListPayload(companyId, passkey, dateFrom, dateTo, page)
      const res = await fetch(PO_LIST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': UA,
          Referer: `${ERP_BASE}/application/expense/po.php`,
          Cookie: cookie,
        },
        body: new URLSearchParams(
          Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])),
        ),
      })

      if (!res.ok) throw new Error(`PO list HTTP ${res.status}`)
      const data = await res.json() as { success?: number; count?: string | number; result?: unknown[] }

      if (data.success !== 1) break
      if (total === null) total = Number(data.count ?? 0)
      const items = (data.result ?? []) as Array<Record<string, unknown>>
      if (!items.length) break

      for (const it of items) {
        const pid = String(it.po_id ?? it.id ?? '')
        if (pid && !seen.has(pid)) {
          seen.add(pid)
          records.push(it)
        }
      }

      if (total && records.length >= total) break
      if (items.length < 50) break
      page += 1
      await sleep(150)
    }

    return records
  }

  private async fetchPODetail(
    cookie: string, companyId: string, passkey: string, poId: string,
  ): Promise<PurchaseOrderLine[]> {
    const payload = {
      company_id: companyId,
      passkey,
      id: poId,
      type: 'po',
      start: 0,
      keyword: '',
      filter: '',
      from: '',
      to: '',
      date_from: '',
      date_to: '',
      activate_date: 'on',
      department: '',
      sort: '',
      advance_search: '1',
      project: '',
      staff: '',
      source: '',
      title: '',
      name: '',
      organization: '',
      tax_id: '',
      doc_from: '',
      doc_to: '',
      total_from: '',
      total_to: '',
      gtotal_from: '',
      gtotal_to: '',
      vat: 'all',
    }

    const res = await fetch(PO_RETRIEVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': UA,
        Referer: `${ERP_BASE}/application/expense/po.php`,
        Cookie: cookie,
      },
      body: new URLSearchParams({ json: JSON.stringify(payload) }),
    })

    if (!res.ok) throw new Error(`PO detail HTTP ${res.status}`)
    const data = await res.json() as {
      success?: number
      head?: Record<string, unknown>
      detail?: unknown[]
      item?: unknown[]
      items?: unknown[]
    }

    if (data.success !== 1) return []
    const head = data.head ?? {}
    const poRef = formatPoRef(head)
    const rawLines = (data.detail ?? data.item ?? data.items ?? []) as Array<Record<string, unknown>>

    return rawLines.map(line => {
      const productName = stripHtml(line.description)
      return {
        po_id: poId,
        po_ref: poRef,
        document_number: String(head.document_number ?? ''),
        product_id: line.product_id != null ? String(line.product_id) : undefined,
        product_name: productName,
        description: productName,
        quantity: Number(line.quantity ?? 0),
        unit: String(line.unit ?? line.sunit ?? ''),
        price: Number(line.price ?? 0),
        item_total: Number(line.total ?? 0),
        item_id: line.item_id != null ? String(line.item_id) : undefined,
        po_item_id: (line.po_item_id ?? line.iv_item_id) != null
          ? String(line.po_item_id ?? line.iv_item_id)
          : undefined,
      }
    })
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
