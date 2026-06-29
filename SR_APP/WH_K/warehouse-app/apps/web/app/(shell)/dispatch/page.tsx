'use client'

import { useMemo, useState } from 'react'
import {
  useMaterialRequests, useMaterialRequestLines, useReloadTrCloudDocs,
} from '@warehouse/api-client/hooks'
import type { TrCloudDocOrder } from '@warehouse/api-client'
import { PageHeader, Card, Btn, SearchInput } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { fmtDateTime, fmtMoney } from '../../../lib/format'
import { ScanInput } from '../../../components/ui/ScanInput'
import { ExpandToggle, LineItemsPanel, MR_LINE_COLUMNS, OrderValue } from '../../../components/ui/LineItemsPanel'
import {
  createEmptyWithdrawDraft,
  deleteDraft,
  loadDrafts,
  upsertDraft,
  type WithdrawDraft,
} from '../../../lib/drafts'

function MrLinePanel({ mrId }: { mrId: string }) {
  const { data: lines, isLoading, error } = useMaterialRequestLines(mrId)
  return (
    <LineItemsPanel
      lines={lines ?? []}
      isLoading={isLoading}
      error={!!error}
      columns={MR_LINE_COLUMNS}
    />
  )
}

function MrDocRow({ row, expanded, onToggle }: {
  row: TrCloudDocOrder
  expanded: boolean
  onToggle: () => void
}) {
  const id = String(row.mr_id ?? '')
  return (
    <div className="border-t border-line">
      <div className="grid grid-cols-[40px_130px_1fr_120px_minmax(100px,1fr)_100px_100px_80px_100px] items-center gap-2 px-4 py-3.5 text-[13px] hover:bg-surface/40">
        <ExpandToggle expanded={expanded} onToggle={onToggle} />
        <span className="font-mono font-bold text-out">{row.doc_ref ?? '—'}</span>
        <span className="truncate text-muted">{row.purpose ?? '—'}</span>
        <span>{row.request_by ?? '—'}</span>
        <span className="truncate text-[12px] text-muted">{row.project ?? row.department ?? '—'}</span>
        <span className="text-muted">{row.issue_date ?? '—'}</span>
        <span className="text-right">
          <OrderValue baht={Number(row.total_value_baht ?? 0) || null} />
        </span>
        <span className="text-right text-muted">{row.line_count ?? '—'}</span>
        <span className="text-right">
          {row.status === 'transit_complete'
            ? <Badge variant="synced">เบิกแล้ว</Badge>
            : <Badge variant="warn">{row.status ?? '—'}</Badge>}
        </span>
      </div>
      {expanded && id ? <MrLinePanel mrId={id} /> : null}
    </div>
  )
}

export default function DispatchPage() {
  const [search, setSearch] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<WithdrawDraft | null>(null)
  const [drafts, setDrafts] = useState<WithdrawDraft[]>(() =>
    loadDrafts().filter(d => d.kind === 'WITHDRAW') as WithdrawDraft[],
  )

  const reloadDocs = useReloadTrCloudDocs()
  const { data: mrData, isLoading, error } = useMaterialRequests({ limit: 80 })

  const rows = useMemo(() => {
    const list = mrData?.orders ?? []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(r =>
      String(r.doc_ref ?? '').toLowerCase().includes(q) ||
      String(r.purpose ?? '').toLowerCase().includes(q) ||
      String(r.request_by ?? '').toLowerCase().includes(q) ||
      String(r.project ?? '').toLowerCase().includes(q),
    )
  }, [mrData?.orders, search])

  const saveDraft = (d: WithdrawDraft) => {
    setDraft(d)
    upsertDraft(d)
    setDrafts(loadDrafts().filter(x => x.kind === 'WITHDRAW') as WithdrawDraft[])
  }

  const removeDraft = (id: string) => {
    deleteDraft(id)
    setDrafts(loadDrafts().filter(x => x.kind === 'WITHDRAW') as WithdrawDraft[])
    if (draft?.id === id) setDraft(null)
  }

  const toggleExpand = (id: string) => {
    const key = `mr:${id}`
    setExpandedKey(expandedKey === key ? null : key)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="เบิกวัตถุดิบ"
        subtitle="สแกนบาร์โค้ดตอนตัดออก · กด + ดูรายการวัตถุดิบ · ต้นทุน real-time"
        actions={
          <>
            <Btn
              variant="secondary"
              disabled={reloadDocs.isPending}
              onClick={() => reloadDocs.mutate('mr')}
            >
              {reloadDocs.isPending ? 'โหลด...' : 'โหลด JSON'}
            </Btn>
            <Btn onClick={() => setDraft(createEmptyWithdrawDraft())}>+ สร้างใบเบิก</Btn>
          </>
        }
      />

      {draft ? (
        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Draft เบิกวัตถุดิบ (offline)</p>
              <p className="mt-1 text-[13px] text-muted">
                สแกนบาร์โค้ดวัตถุดิบเป็นหลัก · เก็บลง localStorage ก่อน sync
              </p>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={() => saveDraft(draft)}>บันทึกลงเครื่อง</Btn>
              <Btn variant="secondary" onClick={() => removeDraft(draft.id)}>ลบทิ้ง</Btn>
              <Btn onClick={() => setDraft(null)}>ปิด</Btn>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-zinc-600">รอบเบิก / มื้ออาหาร</span>
              <input
                value={draft.activity ?? ''}
                onChange={e => setDraft({ ...draft, activity: e.target.value })}
                placeholder="เช่น มื้อกลางวัน"
                className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-zinc-600">เมนู (ถ้ามี)</span>
              <input
                value={draft.machine ?? ''}
                onChange={e => setDraft({ ...draft, machine: e.target.value })}
                placeholder="เช่น แกงเขียวหวาน"
                className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-zinc-600">ผู้เบิก</span>
              <input
                value={draft.requester ?? ''}
                onChange={e => setDraft({ ...draft, requester: e.target.value })}
                className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <ScanInput
              label="สแกนวัตถุดิบ (หลัก)"
              hint="สแกนบาร์โค้ดตอนตัดออก"
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
            <ScanInput
              label="สแกนเลข MR"
              placeholder="สแกน MR..."
              onScan={(v) => setDraft({ ...draft, mrRef: v })}
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-[12px] border border-line">
            <div className="grid grid-cols-[160px_80px_1fr_80px] gap-2 bg-[#fafafb] px-4 py-2 text-[11px] font-bold uppercase text-muted">
              <span>SKU</span><span className="text-right">จำนวน</span><span>หมายเหตุ</span><span />
            </div>
            {draft.lines.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-muted">ยังไม่มีรายการ — สแกนบาร์โค้ดวัตถุดิบ</div>
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
        </Card>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <SearchInput value={search} onChange={setSearch} placeholder="ค้นหา MR / รอบเบิก / ผู้เบิก..." />
        </div>
        {mrData?.meta ? (
          <p className="text-[12px] text-muted">
            {mrData.meta.count} ใบ
            {mrData.summary?.total_value_baht
              ? ` · ต้นทุนรวม ${fmtMoney(mrData.summary.total_value_baht)}`
              : ''}
            {mrData.summary?.line_count
              ? ` · ${mrData.summary.line_count} บรรทัด`
              : ''}
            {' · อัปเดต '}
            {mrData.meta.fetched_at ? fmtDateTime(mrData.meta.fetched_at) : '—'}
          </p>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[40px_130px_1fr_120px_minmax(100px,1fr)_100px_100px_80px_100px] gap-2 bg-[#fafafb] px-4 py-2.5 text-[11px] font-bold uppercase text-muted">
          <span />
          <span>MR</span><span>รอบ/วัตถุประสงค์</span><span>ผู้เบิก</span>
          <span>โครงการ</span><span>วันที่</span><span className="text-right">ต้นทุน</span>
          <span className="text-right">รายการ</span><span className="text-right">สถานะ</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted">กำลังโหลด MR...</div>
        ) : error ? (
          <div className="p-8 text-center text-[13px] text-danger">
            โหลด MR ไม่ได้ — รัน Python trcloud_MRK.py แล้วกด โหลด JSON
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-muted">ไม่พบใบเบิก</div>
        ) : rows.map(r => (
          <MrDocRow
            key={String(r.mr_id)}
            row={r}
            expanded={expandedKey === `mr:${r.mr_id}`}
            onToggle={() => toggleExpand(String(r.mr_id))}
          />
        ))}
      </Card>
    </div>
  )
}
