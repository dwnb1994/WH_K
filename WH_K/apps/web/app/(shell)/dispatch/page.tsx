'use client'

import { useState } from 'react'
import { useWithdraws } from '@warehouse/api-client/hooks'
import type { WithdrawTransaction } from '@warehouse/types'
import { PageHeader, Card, Btn, SearchInput } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { fmtMoney, fmtDateTime } from '../../../lib/format'
import { ScanInput } from '../../../components/ui/ScanInput'
import { PhotoCapture } from '../../../components/ui/PhotoCapture'
import {
  addPhoto,
  createEmptyWithdrawDraft,
  deleteDraft,
  loadDrafts,
  removePhoto,
  upsertDraft,
  type WithdrawDraft,
} from '../../../lib/drafts'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอ Handshake',
  REQ_SIGNED: 'ผู้เบิกลงนาม',
  ISS_SIGNED: 'ผู้จ่ายลงนาม',
  COMPLETE: 'เสร็จสิ้น',
}

type WithdrawRow = WithdrawTransaction & {
  mr_ref?: string
  work_orders?: { wo_number?: string; project?: string }
  employees?: { name?: string }
}

export default function DispatchPage() {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useWithdraws({ limit: 50 })
  const [draft, setDraft] = useState<WithdrawDraft | null>(null)
  const [newSku, setNewSku] = useState('')
  const [newQty, setNewQty] = useState(1)
  const [drafts, setDrafts] = useState<WithdrawDraft[]>(() =>
    loadDrafts().filter(d => d.kind === 'WITHDRAW') as WithdrawDraft[],
  )

  const rows = ((data ?? []) as WithdrawRow[]).filter(w => {
    const mr = w.mr_ref ?? ''
    const wo = w.work_orders ?? w.wo
    const q = search.toLowerCase()
    const proj = wo && 'project' in wo ? wo.project : (wo as { project?: string })?.project
    return !q || mr.toLowerCase().includes(q) || proj?.toLowerCase().includes(q)
  })

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

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="จ่ายออก & จัดส่ง"
        subtitle="รายการเบิกจากใบขอเบิก (MR) · Digital Handshake"
        actions={
          <>
            <Btn variant="secondary">ดึง MR จาก TRCloud</Btn>
            <Btn onClick={() => setDraft(createEmptyWithdrawDraft())}>+ สร้างใบเบิก</Btn>
          </>
        }
      />

      {draft ? (
        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Draft เบิกจ่าย (offline)</p>
              <p className="mt-1 text-[13px] text-muted">
                สแกน MR/สแกนสินค้า/ถ่ายรูป แล้วเก็บลง localStorage ก่อน (ผ่านก่อน บันทึกไว้)
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
              <span className="mb-1 block text-[12px] font-semibold text-zinc-600">รถ/คัน (machine)</span>
              <input
                value={draft.machine ?? ''}
                onChange={e => setDraft({ ...draft, machine: e.target.value })}
                placeholder="เช่น TRUCK-01"
                className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-zinc-600">กิจกรรม (activity)</span>
              <input
                value={draft.activity ?? ''}
                onChange={e => setDraft({ ...draft, activity: e.target.value })}
                placeholder="เช่น MAINTENANCE"
                className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-zinc-600">ผู้เบิก</span>
              <input
                value={draft.requester ?? ''}
                onChange={e => setDraft({ ...draft, requester: e.target.value })}
                placeholder="ชื่อ/รหัสพนักงาน"
                className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <ScanInput
              label="สแกน MR"
              hint="สแกนแล้วจะใส่เลข MR ลง draft"
              placeholder="สแกน MR..."
              onScan={(v) => setDraft({ ...draft, mrRef: v })}
            />
            <div className="rounded-[14px] border border-line bg-white p-4">
              <p className="text-[12px] font-bold uppercase tracking-wide text-muted">เพิ่มรายการเบิก</p>
              <p className="mt-1 text-[12px] text-muted">พิมพ์ SKU แล้วกดเพิ่ม (ไม่ใช้สแกน)</p>
              <div className="mt-3 grid grid-cols-[1fr_90px_90px] gap-2">
                <input
                  value={newSku}
                  onChange={e => setNewSku(e.target.value)}
                  placeholder="SKU"
                  className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-[13px] outline-none focus:border-brand"
                />
                <input
                  value={newQty}
                  onChange={e => setNewQty(Number(e.target.value || 0))}
                  inputMode="numeric"
                  className="w-full rounded-lg border border-line bg-[#fafafb] px-3 py-2 text-right text-[13px] outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => {
                    const sku = newSku.trim()
                    if (!sku) return
                    const next = {
                      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
                      sku,
                      qty: Number(newQty || 1),
                    }
                    setDraft({ ...draft, lines: [next, ...draft.lines] })
                    setNewSku('')
                    setNewQty(1)
                  }}
                  className="rounded-lg bg-brand px-3 py-2 text-[13px] font-semibold text-white hover:bg-zinc-800"
                >
                  เพิ่ม
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <PhotoCapture
              onAdd={(p) => {
                const next = addPhoto(draft, p) as WithdrawDraft
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
                      onClick={() => setDraft(removePhoto(draft, ph.id) as WithdrawDraft)}
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
              <div className="px-4 py-6 text-center text-[13px] text-muted">ยังไม่มีรายการ</div>
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
                    {(d.machine || 'machine?')} · {d.lines.length} รายการ · {new Date(d.updatedAt).toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="mb-4 flex justify-end">
        <div className="w-full max-w-xs">
          <SearchInput value={search} onChange={setSearch} placeholder="ค้นหา MR / โครงการ..." />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[120px_1fr_120px_100px_100px_90px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11.5px] font-bold uppercase text-muted">
          <span>MR</span><span>โครงการ</span><span>ผู้เบิก</span>
          <span className="text-right">ต้นทุน</span><span className="text-right">Handshake</span><span className="text-right">ซิงก์</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted">กำลังโหลด...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-muted">ไม่พบรายการเบิก</div>
        ) : rows.map(w => {
          const wo = w.work_orders
          const emp = w.employees
          return (
            <div
              key={w.id}
              className="grid grid-cols-[120px_1fr_120px_100px_100px_90px] items-center gap-2 border-t border-line px-5 py-3.5 text-[13px]"
            >
              <span className="font-mono font-bold text-out">{w.mr_ref ?? '—'}</span>
              <span>{wo?.project ?? w.wo?.project ?? '—'}</span>
              <span className="text-muted">{emp?.name ?? '—'}</span>
              <span className="text-right font-semibold">{fmtMoney(w.totalCost)}</span>
              <span className="text-right">
                <Badge variant={w.handshakeStatus === 'COMPLETE' ? 'synced' : 'warn'}>
                  {STATUS_LABEL[w.handshakeStatus] ?? w.handshakeStatus}
                </Badge>
              </span>
              <span className="text-right">
                {w.syncStatus === 'SYNCED'
                  ? <Badge variant="synced">OK</Badge>
                  : w.syncStatus === 'ERROR'
                    ? <Badge variant="error">!</Badge>
                    : <Badge variant="pending">รอ</Badge>}
              </span>
            </div>
          )
        })}
      </Card>

      {rows[0] && (
        <p className="mt-3 text-[12px] text-muted">
          อัปเดตล่าสุด: {fmtDateTime(rows[0].createdAt)}
        </p>
      )}
    </div>
  )
}
