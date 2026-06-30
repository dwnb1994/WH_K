import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'

export type TrCloudDocKind = 'gr' | 'mr' | 'inc' | 'po'

export interface TrCloudJsonFile {
  schema_version?: number
  doc_type?: string
  fetched_at: string
  date_from: string
  date_to: string
  source?: string
  company_id?: string
  count: number
  summary?: {
    order_count: number
    line_count: number
    total_value_baht: number
    unique_products: number
  }
  orders: Array<Record<string, unknown>>
  lines: Array<Record<string, unknown>>
  product_index?: Array<Record<string, unknown>>
}

export interface IncStockPosition {
  id: string
  product_id: string
  product_name: string
  warehouse: string
  unit: string
  on_hand: number
  line_count: number
  doc_count: number
}

const DOC_META: Record<TrCloudDocKind, { idField: string; envKey: string; defaultFile: string }> = {
  gr: { idField: 'receive_id', envKey: 'TRCLOUD_GR_JSON_PATH', defaultFile: 'gr.json' },
  mr: { idField: 'mr_id', envKey: 'TRCLOUD_MR_JSON_PATH', defaultFile: 'mr.json' },
  inc: { idField: 'document_id', envKey: 'TRCLOUD_INC_JSON_PATH', defaultFile: 'inc.json' },
  po: { idField: 'po_id', envKey: 'TRCLOUD_PO_JSON_PATH', defaultFile: 'po.json' },
}

@Injectable()
export class TRCloudDocsService implements OnModuleInit {
  private readonly logger = new Logger(TRCloudDocsService.name)
  private readonly caches = new Map<TrCloudDocKind, TrCloudJsonFile | null>()

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    for (const kind of Object.keys(DOC_META) as TrCloudDocKind[]) {
      await this.reload(kind)
    }
  }

  getMeta(kind: TrCloudDocKind) {
    const c = this.caches.get(kind)
    const meta = DOC_META[kind]
    return {
      kind,
      schema_version: c?.schema_version ?? 1,
      doc_type: c?.doc_type ?? kind.toUpperCase(),
      fetched_at: c?.fetched_at ?? null,
      date_from: c?.date_from ?? null,
      date_to: c?.date_to ?? null,
      count: c?.count ?? c?.orders?.length ?? 0,
      source: c?.source ?? 'none',
      company_id: c?.company_id ?? null,
      id_field: meta.idField,
      summary: c?.summary ?? null,
    }
  }

  getProductIndex(kind: TrCloudDocKind) {
    const cached = this.caches.get(kind)
    if (cached?.product_index?.length) return cached.product_index
    if (kind === 'inc') return this.buildProductIndexFromLines(cached?.lines ?? [])
    return []
  }

  /** รวมยอดจาก INC lines แยกตาม SKU + คลัง (สำหรับหน้าสต็อกคงคลัง) */
  getIncStockPositions(params?: { search?: string; limit?: number }): IncStockPosition[] {
    const lines = this.caches.get('inc')?.lines ?? []
    const map = new Map<string, IncStockPosition>()
    const docsPerKey = new Map<string, Set<string>>()

    for (const ln of lines) {
      const pid = String(ln.product_id ?? '').trim()
      if (!pid) continue
      const wh = String(ln.warehouse ?? '—').trim() || '—'
      const key = `${pid}\0${wh}`
      const qty = Number(ln.quantity ?? 0) || 0

      let row = map.get(key)
      if (!row) {
        row = {
          id: key,
          product_id: pid,
          product_name: String(ln.product_name ?? ln.description ?? ''),
          warehouse: wh,
          unit: String(ln.unit ?? ''),
          on_hand: 0,
          line_count: 0,
          doc_count: 0,
        }
        map.set(key, row)
        docsPerKey.set(key, new Set())
      }
      row.on_hand += qty
      row.line_count += 1
      const docId = String(ln.document_id ?? '')
      if (docId) docsPerKey.get(key)!.add(docId)
      if (ln.product_name) row.product_name = String(ln.product_name)
      if (ln.unit) row.unit = String(ln.unit)
    }

    for (const [key, row] of map) {
      row.doc_count = docsPerKey.get(key)?.size ?? 0
      row.on_hand = Math.round(row.on_hand * 1000) / 1000
    }

    let rows = Array.from(map.values())
    if (params?.search) {
      const q = params.search.toLowerCase()
      rows = rows.filter(r =>
        r.product_id.toLowerCase().includes(q) ||
        r.product_name.toLowerCase().includes(q) ||
        r.warehouse.toLowerCase().includes(q),
      )
    }

    const limit = params?.limit ?? 500
    return rows
      .sort((a, b) => a.product_id.localeCompare(b.product_id) || a.warehouse.localeCompare(b.warehouse))
      .slice(0, limit)
  }

  private buildProductIndexFromLines(lines: Array<Record<string, unknown>>) {
    const idx = new Map<string, Record<string, unknown>>()
    for (const ln of lines) {
      const pid = String(ln.product_id ?? '').trim()
      if (!pid) continue
      const ent = idx.get(pid) ?? {
        product_id: pid,
        product_name: '',
        unit: '',
        line_count: 0,
        total_qty: 0,
      }
      ent.line_count = Number(ent.line_count) + 1
      ent.total_qty = Math.round((Number(ent.total_qty) + (Number(ln.quantity ?? 0) || 0)) * 1000) / 1000
      if (ln.product_name) ent.product_name = ln.product_name
      if (ln.unit) ent.unit = ln.unit
      idx.set(pid, ent)
    }
    return Array.from(idx.values()).sort((a, b) =>
      String(a.product_id).localeCompare(String(b.product_id)),
    )
  }

  listOrders(
    kind: TrCloudDocKind,
    params?: { docRef?: string; vendor?: string; product?: string; status?: string; limit?: number },
  ) {
    let rows = this.caches.get(kind)?.orders ?? []
    const lines = this.caches.get(kind)?.lines ?? []

    if (params?.docRef) {
      const q = params.docRef.toLowerCase()
      rows = rows.filter(r =>
        String(r.doc_ref ?? '').toLowerCase().includes(q) ||
        String(r.document_number ?? '').toLowerCase().includes(q),
      )
    }
    if (params?.vendor) {
      const q = params.vendor.toLowerCase()
      rows = rows.filter(r => {
        const name = String(
          r.supplier_name ?? r.organization ?? r.name ?? r.request_by ?? '',
        ).toLowerCase()
        return name.includes(q)
      })
    }
    if (params?.product) {
      const q = params.product.toLowerCase()
      rows = rows.filter(r => {
        const names = (r.products as string[] | undefined) ?? []
        if (names.some(n => n.toLowerCase().includes(q))) return true
        const idf = DOC_META[kind].idField
        const docId = String(r[idf] ?? '')
        return lines.some(ln => {
          if (String(ln[idf] ?? '') !== docId) return false
          const pn = String(ln.product_name ?? ln.product ?? ln.description ?? '')
          return pn.toLowerCase().includes(q)
        })
      })
    }
    if (params?.status) {
      const q = params.status.toLowerCase()
      rows = rows.filter(r =>
        String(r.status ?? '').toLowerCase().includes(q) ||
        String(r.approve_status ?? '').toLowerCase().includes(q) ||
        String(r.sync_status ?? '').toLowerCase().includes(q),
      )
    }

    const limit = params?.limit ?? 200
    return rows.slice(0, limit)
  }

  getLines(kind: TrCloudDocKind, docId: string): Array<Record<string, unknown>> {
    const idf = DOC_META[kind].idField
    return (this.caches.get(kind)?.lines ?? [])
      .filter(ln => String(ln[idf] ?? '') === String(docId))
      .sort((a, b) => Number(a.line_no ?? 0) - Number(b.line_no ?? 0))
  }

  private resolvePath(kind: TrCloudDocKind): string {
    const meta = DOC_META[kind]
    const rel = this.config.get(meta.envKey, `./data/${meta.defaultFile}`)
    return path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel)
  }

  private loadFromFile(kind: TrCloudDocKind): boolean {
    const jsonPath = this.resolvePath(kind)
    try {
      if (!fs.existsSync(jsonPath)) {
        this.caches.set(kind, null)
        this.logger.warn(`${kind.toUpperCase()} JSON not found: ${jsonPath}`)
        return false
      }
      const raw = fs.readFileSync(jsonPath, 'utf-8')
      const data = JSON.parse(raw) as TrCloudJsonFile
      this.caches.set(kind, data)
      this.logger.log(`Loaded ${data.count ?? data.orders?.length ?? 0} ${kind.toUpperCase()} orders from ${jsonPath}`)
      return true
    } catch (e) {
      this.logger.warn(`Cannot load ${kind.toUpperCase()} JSON: ${e}`)
      this.caches.set(kind, null)
      return false
    }
  }

  async reloadFromGcs(kind: TrCloudDocKind): Promise<boolean> {
    const bucket = this.config.get('TRCLOUD_GCS_BUCKET', 'kitchen-sepon-data')
    const gcsPath = `trcloud/snapshots/${kind}/latest.json`

    try {
      const { Storage } = await import('@google-cloud/storage')
      const storage = new Storage()
      const [content] = await storage.bucket(bucket).file(gcsPath).download()
      const data = JSON.parse(content.toString('utf-8')) as TrCloudJsonFile
      this.caches.set(kind, data)
      this.logger.log(`GCS reload: ${kind.toUpperCase()} ${data.count ?? data.orders?.length ?? 0} records`)
      return true
    } catch (err) {
      this.logger.warn(`GCS reload failed for ${kind}: ${(err as Error).message}`)
      return false
    }
  }

  async reload(kind: TrCloudDocKind): Promise<boolean> {
    const useGcs = this.config.get('SYNC_TRIGGER_MODE') === 'gcp'
    if (useGcs) {
      const loaded = await this.reloadFromGcs(kind)
      if (loaded) return true
    }
    return this.loadFromFile(kind)
  }
}
