'use client'

import { useMemo, useState } from 'react'
import {
  usePurchaseOrders, usePurchaseOrderLines, useReceives, useSyncPurchaseOrders,
} from '@warehouse/api-client/hooks'
import type { PurchaseOrderRow } from '@warehouse/api-client'
import { PageHeader, Card, Btn } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { fmtMoney, fmtDateTime } from '../../../lib/format'
import { ScanInput } from '../../../components/ui/ScanInput'
import { PhotoCapture } from '../../../components/ui/PhotoCapture'
import {
  addPhoto,
  createEmptyReceiveDraft,
  deleteDraft,
  loadDrafts,
  removePhoto,
  upsertDraft,
  type ReceiveDraft,
} from '../../../lib/drafts'

const TABS = ['ใบสั่งซื้อ (PO)', 'ประวัติรับเข้า (GR)'] as const
const GR_FILTERS = ['ทั้งหมด', 'PENDING', 'SYNCED', 'ERROR'] as const
const PAGE_SIZE = 40

function poStatusBadge(status: string, approve: string) {
  const s = `${status} ${approve}`.toLowerCase()
  if (s.includes('complete') || s.includes('success') || s.includes('อนุมัติ') || approve === 'yes') {
    return <Badge variant="synced">อนุมัติแล้ว</Badge>
  }
  if (s.includes('reject') || s.includes('ยกเลิก')) {
    return <Badge variant="error">ยกเลิก</Badge>
  }
  return <Badge variant="warn">รอดำเนินการ</Badge>
}

function PoLinePanel({ poId, poRef }: { poId: string; poRef: string }) {
  const { data: lines, isLoading, error } = usePurchaseOrderLines(poId)

  if (isLoading) {
    return (
      <div className="border-t border-line bg-surface/60 px-5 py-4 text-[13px] text-muted">
        กำลังโหลดรายการสินค้า {poRef}...
      </div>
    )
  }
  if (error) {
    return (
      <div className="border-t border-line bg-red-50 px-5 py-4 text-[13px] text-danger">
        โหลดรายการสินค้าไม่ได้
      </div>
    )
  }
  if (!lines?.length) {
    return (
      <div className="border-t border-line bg-surface/60 px-5 py-4 text-[13px] text-muted">
        ไม่พบรายการสินค้าในใบนี้
      </div>
    )
  }

  return (
    <div className="border-t border-line bg-[#fafafb]">
      <div className="grid grid-cols-[1fr_80px_80px_100px_100px] gap-2 px-5 py-2 text-[11px] font-bold uppercase text-muted">
        <span>สินค้า</span>
        <span className="text-right">จำนวน</span>
        <span>หน่วย</span>
        <span className="text-right">ราคา/หน่วย</span>
        <span className="text-right">รวม</span>
      </div>
      {lines.map((ln, i) => (
        <div
          key={`${poId}-${ln.item_id ?? i}`}
          className="grid grid-cols-[1fr_80px_80px_100px_100px] gap-2 border-t border-line/80 px-5 py-2.5 text-[13px]"
        >
          <div>
            <p className="font-medium text-ink">{ln.product_name || ln.description || '—'}</p>
            {ln.product_id ? (
              <p className="mt-0.5 font-mono text-[11px] text-muted">ID {ln.product_id}</p>
            ) : null}
          </div>
          <span className="text-right font-semibold">{ln.quantity ?? '—'}</span>
          <span className="text-muted">{ln.unit || '—'}</span>
          <span className="text-right">{ln.price != null ? fmtMoney(ln.price) : '—'}</span>
          <span className="text-right font-semibold">
            {ln.item_total != null ? fmtMoney(ln.item_total) : '—'}
          </span>
        </div>
      ))}
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Btn variant="secondary">ดูรายละเอียด PO</Btn>
        <Btn>เริ่มรับเข้า (GR)</Btn>
      </div>
    </div>
  )
}

function PoRow({ row, expanded, onToggle }: {
  row: PurchaseOrderRow
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-t border-line">
      <div className="grid grid-cols-[40px_150px_1fr_minmax(100px,1fr)_100px_110px_80px_100px] items-center gap-2 px-4 py-3.5 text-[13px] hover:bg-surface/40">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'ย่อรายการ' : 'ดูรายการสินค้า'}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-lg font-bold transition ${
            expanded
              ? 'border-brand bg-brand text-white'
              : 'border-line bg-white text-brand hover:border-brand'
          }`}
        >
          {expanded ? '−' : '+'}
        </button>
        <span className="font-mono font-bold text-in">{row.po_ref}</span>
        <span className="truncate font-medium">{row.supplier_name || '—'}</span>
        <span className="truncate text-[12px] text-muted">{row.project || row.department || '—'}</span>
        <span className="text-muted">{row.issue_date || '—'}</span>
        <span className="text-right font-semibold">{fmtMoney(row.grand_total)}</span>
        <span className="text-right text-muted">{row.line_count || '—'}</span>
        <span className="text-right">{poStatusBadge(row.status, row.approve_status)}</span>
      </div>
      {expanded ? <PoLinePanel poId={row.po_id} poRef={row.po_ref} /> : null}
    </div>
  )
}

export default function ReceivePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('ใบสั่งซื้อ (PO)')
  const [poRef, setPoRef] = useState('')
  const [vendor, setVendor] = useState('')
  const [product, setProduct] = useState('')
  const [grFilter, setGrFilter] = useState<string>('ทั้งหมด')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState<ReceiveDraft | null>(null)
  const [drafts, setDrafts] = useState<ReceiveDraft[]>(() =>
    loadDrafts().filter(d => d.kind === 'RECEIVE') as ReceiveDraft[],
  )

  const filters = useMemo(
    () => ({
      poRef: poRef.trim() || undefined,
      vendor: vendor.trim() || undefined,
      product: product.trim() || undefined,
    }),
    [poRef, vendor, product],
  )

  const { data: poData, isLoading: poLoading, error: poError } = usePurchaseOrders(filters)
  const syncPO = useSyncPurchaseOrders()

  const syncStatus = grFilter === 'ทั้งหมด' ? undefined : grFilter
  const { data: grData, isLoading: grLoading } = useReceives({ syncStatus, limit: 50 })

  const allPoRows = poData?.orders ?? []
  const totalPages = Math.max(1, Math.ceil(allPoRows.length / PAGE_SIZE))
  const poRows = allPoRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const grSearch = `${poRef} ${vendor}`.trim().toLowerCase()
  const grRows = (grData ?? []).filter(r =>
    !grSearch ||
    r.po_ref.toLowerCase().includes(grSearch) ||
    r.supplier_name.toLowerCase().includes(grSearch),
  )

  const clearFilters = () => {
    setPoRef('')
    setVendor('')
    setProduct('')
    setPage(1)
    setExpandedId(null)
  }

  const saveDraft = (d: ReceiveDraft) => {
    setDraft(d)
    upsertDraft(d)
    setDrafts(loadDrafts().filter(x => x.kind === 'RECEIVE') as ReceiveDraft[])
  }

  const removeDraft = (id: string) => {
    deleteDraft(id)
    setDrafts(loadDrafts().filter(x => x.kind === 'RECEIVE') as ReceiveDraft[])
    if (draft?.id === id) setDraft(null)
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="รับเข้าสินค้า"
        subtitle="ค้นหาใบสั่งซื้อจาก TRCloud · ตรวจรายการสินค้า · สร้าง Goods Receipt"
        actions={
          <>
            <Btn
              variant="secondary"
              disabled={syncPO.isPending}
              onClick={() => syncPO.mutate()}
            >
              {syncPO.isPending ? 'กำลังซิงก์...' : 'ซิงก์ PO'}
            </Btn>
            <Btn onClick={() => setDraft(createEmptyReceiveDraft())}>+ รับเข้าใหม่</Btn>
          </>
        }
      />

      {draft ? (
        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Draft รับเข้า (offline)</p>
              <p className="mt-1 text-[13px] text-muted">
                สแกน PO / สแกนสินค้า / ถ่ายรูป แล้วเก็บลง localStorage ก่อน
              </p>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={() => saveDraft(draft)}>
                บันทึกลงเครื่อง
              </Btn>
              <Btn
                variant="secondary"
                onClick={() => {
                  removeDraft(draft.id)
                }}
              >
                ลบทิ้ง
              </Btn>
              <Btn onClick={() => setDraft(null)}>ปิด</Btn>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-zinc-600">เลข PO</span>
              <input
                value={draft.poRef ?? ''}
                onChange={e => setDraft({ ...draft, poRef: e.target.value })}
                placeholder="เช่น PO26060139"
                className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-zinc-600">คลังโรงครัว (code)</span>
              <input
                value={draft.warehouseCode ?? ''}
                onChange={e => setDraft({ ...draft, warehouseCode: e.target.value })}
                placeholder="เช่น TN_คลังโรงครัวเซโปน"
                className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-zinc-600">ผู้รับ</span>
              <input
                value={draft.receivedBy ?? ''}
                onChange={e => setDraft({ ...draft, receivedBy: e.target.value })}
                placeholder="ชื่อผู้รับ/รหัส"
                className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <ScanInput
              label="สแกน PO เพื่อดึงเข้า Draft"
              hint="สแกนแล้วจะใส่เลขลงช่อง PO (ยังไม่ยิง API)"
              placeholder="สแกน PO..."
              onScan={(v) => setDraft({ ...draft, poRef: v })}
            />
            <ScanInput
              label="สแกน SKU เพื่อเพิ่มบรรทัดรับเข้า"
              hint="เหมาะกับเครื่องสแกนแบบยิงเป็นคีย์บอร์ด แล้วจบด้วย Enter"
              placeholder="สแกน SKU..."
              onScan={(sku) => {
                const next = {
                  id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
                  sku,
                  qty: 1,
                }
                setDraft({ ...draft, lines: [next, ...draft.lines] })
              }}
            />
          </div>

          <div className="mt-4">
            <PhotoCapture
              onAdd={(p) => {
                const next = addPhoto(draft, p) as ReceiveDraft
                setDraft(next)
              }}
            />
          </div>

          {draft.photos.length ? (
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {draft.photos.map(ph => (
                <div key={ph.id} className="rounded-[12px] border border-line bg-white p-2">
                  <img src={ph.dataUrl} alt={ph.name} className="h-40 w-full rounded-lg object-cover" />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] text-muted">{ph.name}</span>
                    <button
                      type="button"
                      onClick={() => setDraft(removePhoto(draft, ph.id) as ReceiveDraft)}
                      className="text-[12px] font-semibold text-danger hover:underline"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-[12px] border border-line">
            <div className="grid grid-cols-[160px_80px_1fr_80px] gap-2 bg-[#fafafb] px-4 py-2 text-[11px] font-bold uppercase text-muted">
              <span>SKU</span><span className="text-right">จำนวน</span><span>หมายเหตุ</span><span />
            </div>
            {draft.lines.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-muted">ยังไม่มีรายการ (สแกน SKU เพื่อเพิ่ม)</div>
            ) : draft.lines.map(ln => (
              <div key={ln.id} className="grid grid-cols-[160px_80px_1fr_80px] items-center gap-2 border-t border-line px-4 py-2.5 text-[13px]">
                <span className="font-mono font-semibold">{ln.sku}</span>
                <input
                  value={ln.qty}
                  onChange={e => {
                    const qty = Number(e.target.value || 0)
                    setDraft({
                      ...draft,
                      lines: draft.lines.map(x => x.id === ln.id ? { ...x, qty } : x),
                    })
                  }}
                  inputMode="numeric"
                  className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-right text-[13px] outline-none focus:border-brand"
                />
                <input
                  value={ln.remark ?? ''}
                  onChange={e => {
                    const remark = e.target.value
                    setDraft({
                      ...draft,
                      lines: draft.lines.map(x => x.id === ln.id ? { ...x, remark } : x),
                    })
                  }}
                  placeholder="หมายเหตุ..."
                  className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[13px] outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, lines: draft.lines.filter(x => x.id !== ln.id) })}
                  className="text-right text-[12px] font-semibold text-danger hover:underline"
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>

          {drafts.length ? (
            <div className="mt-4 rounded-[12px] border border-line bg-[#fafafb] p-3">
              <p className="text-[11px] font-bold uppercase text-muted">Draft ที่บันทึกไว้ในเครื่อง</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {drafts.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDraft(d)}
                    className={d.id === draft.id
                      ? 'rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white'
                      : 'rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700'}
                  >
                    {(d.poRef || 'PO?')} · {d.lines.length} รายการ · {new Date(d.updatedAt).toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'PO ทั้งหมด', value: poData?.meta.count ?? '—' },
          { label: 'แสดงผล', value: allPoRows.length },
          { label: 'อัปเดตล่าสุด', value: poData?.meta.fetched_at ? fmtDateTime(poData.meta.fetched_at).split(' ')[0] : '—' },
          { label: 'ช่วงวันที่', value: poData ? `${poData.meta.date_from} → ${poData.meta.date_to}` : '—' },
        ].map(k => (
          <Card key={k.label} className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase text-muted">{k.label}</p>
            <p className="mt-1 text-[15px] font-bold text-ink">{k.value}</p>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
              tab === t ? 'bg-brand text-white' : 'bg-surface text-zinc-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'ใบสั่งซื้อ (PO)' ? (
        <>
          <Card className="mb-4 p-4">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-muted">ค้นหา</p>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-zinc-600">เลข PO</span>
                <input
                  value={poRef}
                  onChange={e => { setPoRef(e.target.value); setPage(1) }}
                  placeholder="เช่น PO26050364"
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-zinc-600">ชื่อ Vendor / ซัพพลายเออร์</span>
                <input
                  value={vendor}
                  onChange={e => { setVendor(e.target.value); setPage(1) }}
                  placeholder="ชื่อบริษัท..."
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-zinc-600">ชื่อสินค้า</span>
                <input
                  value={product}
                  onChange={e => { setProduct(e.target.value); setPage(1) }}
                  placeholder="ค้นหาในชื่อสินค้า..."
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand"
                />
              </label>
            </div>
            {(poRef || vendor || product) ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-[12px] font-semibold text-link hover:underline"
              >
                ล้างตัวกรอง
              </button>
            ) : null}
          </Card>

          <Card className="overflow-hidden">
            <div className="grid grid-cols-[40px_150px_1fr_minmax(100px,1fr)_100px_110px_80px_100px] gap-2 bg-[#fafafb] px-4 py-2.5 text-[11px] font-bold uppercase text-muted">
              <span />
              <span>PO Ref</span>
              <span>ซัพพลายเออร์</span>
              <span>โครงการ</span>
              <span>วันที่</span>
              <span className="text-right">มูลค่า</span>
              <span className="text-right">รายการ</span>
              <span className="text-right">สถานะ</span>
            </div>

            {poLoading ? (
              <div className="p-10 text-center text-muted">กำลังโหลด PO...</div>
            ) : poError ? (
              <div className="p-10 text-center text-[13px] text-danger">
                โหลด PO ไม่ได้ — ตรวจสอบว่า API รันอยู่ที่ port 3000
              </div>
            ) : poRows.length === 0 ? (
              <div className="p-10 text-center text-[13px] text-muted">
                ไม่พบใบสั่งซื้อตามเงื่อนไข
              </div>
            ) : poRows.map(r => (
              <PoRow
                key={r.po_id}
                row={r}
                expanded={expandedId === r.po_id}
                onToggle={() => setExpandedId(expandedId === r.po_id ? null : r.po_id)}
              />
            ))}
          </Card>

          {allPoRows.length > PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-between text-[13px]">
              <span className="text-muted">
                หน้า {page}/{totalPages} · ทั้งหมด {allPoRows.length} ใบ
              </span>
              <div className="flex gap-2">
                <Btn variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  ก่อนหน้า
                </Btn>
                <Btn variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  ถัดไป
                </Btn>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {GR_FILTERS.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setGrFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                  grFilter === f ? 'bg-brand text-white' : 'bg-surface text-zinc-600'
                }`}
              >
                {f === 'ทั้งหมด' ? 'ทั้งหมด' : f === 'PENDING' ? 'รอซิงก์' : f === 'SYNCED' ? 'ซิงก์แล้ว' : 'ผิดพลาด'}
              </button>
            ))}
          </div>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-[140px_1fr_120px_120px_100px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11.5px] font-bold uppercase text-muted">
              <span>PO Ref</span><span>ซัพพลายเออร์</span><span>ผู้รับ</span>
              <span className="text-right">มูลค่า</span><span className="text-right">สถานะ</span>
            </div>
            {grLoading ? (
              <div className="p-8 text-center text-muted">กำลังโหลด...</div>
            ) : grRows.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-muted">ไม่พบรายการรับเข้า</div>
            ) : grRows.map(r => (
              <div
                key={r.id}
                className="grid grid-cols-[140px_1fr_120px_120px_100px] items-center gap-2 border-t border-line px-5 py-3.5 text-[13px]"
              >
                <span className="font-mono font-bold text-in">{r.po_ref}</span>
                <span>{r.supplier_name}</span>
                <span className="text-muted">{r.employees?.name ?? '—'}</span>
                <span className="text-right font-semibold">{fmtMoney(r.total_value)}</span>
                <span className="text-right">
                  {r.sync_status === 'SYNCED'
                    ? <Badge variant="synced">ซิงก์แล้ว</Badge>
                    : r.sync_status === 'ERROR'
                      ? <Badge variant="error">ผิดพลาด</Badge>
                      : <Badge variant="warn">รอซิงก์</Badge>}
                </span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
