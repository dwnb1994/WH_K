import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'

export type TrCloudDocKind = 'gr' | 'mr' | 'inc'

export interface TrCloudJsonFile {
  schema_version?: number
  doc_type?: string
  fetched_at: string
  date_from: string
  date_to: string
  source: string
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

const DOC_META: Record<TrCloudDocKind, { idField: string; envKey: string; defaultFile: string }> = {
  gr: { idField: 'receive_id', envKey: 'TRCLOUD_GR_JSON_PATH', defaultFile: 'gr.json' },
  mr: { idField: 'mr_id', envKey: 'TRCLOUD_MR_JSON_PATH', defaultFile: 'mr.json' },
  inc: { idField: 'document_id', envKey: 'TRCLOUD_INC_JSON_PATH', defaultFile: 'inc.json' },
}

@Injectable()
export class TRCloudDocsService implements OnModuleInit {
  private readonly logger = new Logger(TRCloudDocsService.name)
  private readonly caches = new Map<TrCloudDocKind, TrCloudJsonFile | null>()

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    for (const kind of Object.keys(DOC_META) as TrCloudDocKind[]) {
      this.loadFromFile(kind)
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
      count: c?.count ?? 0,
      source: c?.source ?? 'none',
      company_id: c?.company_id ?? null,
      id_field: meta.idField,
      summary: c?.summary ?? null,
    }
  }

  getProductIndex(kind: TrCloudDocKind) {
    return this.caches.get(kind)?.product_index ?? []
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
      this.logger.log(`Loaded ${data.count} ${kind.toUpperCase()} orders from ${jsonPath}`)
      return true
    } catch (e) {
      this.logger.warn(`Cannot load ${kind.toUpperCase()} JSON: ${e}`)
      this.caches.set(kind, null)
      return false
    }
  }

  reload(kind: TrCloudDocKind) {
    return this.loadFromFile(kind)
  }
}
