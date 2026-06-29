'use client'

import Link from 'next/link'
import {
  useDashboardKPI, useReceives, useWithdraws, useSyncStatus,
} from '@warehouse/api-client/hooks'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { PageHeader, KpiCard, Card, Btn } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { fmtMoney, fmtTime } from '../../../lib/format'

import type { WithdrawTransaction } from '@warehouse/types'

const WEEKLY = [
  { day: 'จ', in: 90, out: 70 },
  { day: 'อ', in: 120, out: 95 },
  { day: 'พ', in: 70, out: 110 },
  { day: 'พฤ', in: 140, out: 90 },
  { day: 'ศ', in: 110, out: 130 },
  { day: 'ส', in: 60, out: 48 },
  { day: 'อา', in: 38, out: 30 },
]

const CATEGORIES = [
  { name: 'เนื้อสัตว์ / ปลา', pct: 38, color: '#d6493b' },
  { name: 'ผัก / ผลไม้', pct: 28, color: '#2f9e6b' },
  { name: 'เครื่องปรุง / น้ำมัน', pct: 22, color: '#d99a2b' },
  { name: 'อื่น ๆ', pct: 12, color: '#64748b' },
]

function syncBadge(status: string) {
  if (status === 'SYNCED') return <Badge variant="synced">ซิงก์แล้ว</Badge>
  if (status === 'ERROR') return <Badge variant="error">ผิดพลาด</Badge>
  return <Badge variant="warn">รอซิงก์</Badge>
}

export default function DashboardPage() {
  const { data: kpi, isLoading } = useDashboardKPI()
  const { data: receives } = useReceives({ limit: 5 })
  const { data: withdraws } = useWithdraws({ limit: 5 })
  const { data: sync } = useSyncStatus()

  const pending = sync?.counts?.PENDING ?? kpi?.pendingSyncCount ?? 0
  const errors = sync?.counts?.ERROR ?? 0

  const recent = [
    ...(receives ?? []).map(r => ({
      doc: r.po_ref,
      type: 'รับเข้า' as const,
      typeVariant: 'in' as const,
      desc: r.supplier_name,
      qty: `+${fmtMoney(r.total_value).replace('฿', '')}`,
      time: fmtTime(r.created_at),
      sync: r.sync_status,
    })),
    ...(withdraws ?? []).map((w: WithdrawTransaction & { mr_ref?: string }) => ({
      doc: w.mr_ref ?? 'MR',
      type: 'จ่ายออก' as const,
      typeVariant: 'out' as const,
      desc: '—',
      qty: `−${w.totalCost}`,
      time: fmtTime(w.createdAt),
      sync: w.syncStatus,
    })),
  ].slice(0, 6)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="ภาพรวมคลังสำรับลาว"
        subtitle={`ต้นทุน real-time · ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} · อัปเดต ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`}
        actions={
          <>
            <Btn variant="secondary">7 วันล่าสุด</Btn>
            <Btn>Export</Btn>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-[14px] border border-line bg-white" />
            ))
          : (
            <>
              <KpiCard
                label="ต้นทุน/คน/วัน"
                value={kpi?.costPerHeadPerDay != null ? fmtMoney(kpi.costPerHeadPerDay) : '—'}
                hint={kpi?.headcountToday ? `พนักงานวันนี้ ${kpi.headcountToday} คน` : 'เมนู → เบิก → ÷ พนักงานวันนี้'}
                hintTone="good"
              />
              <KpiCard label="ต้นทุนเบิกเดือนนี้" value={fmtMoney(kpi?.monthlyWithdrawCost ?? 0)} hint="จาก Cost Snapshot" />
              <KpiCard label="มูลค่าสต็อกวัตถุดิบ" value={fmtMoney(kpi?.totalStockValue ?? 0)} hint="อัปเดต real-time" />
              <KpiCard
                label="รอซิงก์ TRCloud"
                value={String(pending)}
                hint={errors > 0 ? `มี ${errors} รายการผิดพลาด` : 'ทุกรายการปกติ'}
                hintTone={errors > 0 ? 'danger' : 'good'}
              />
            </>
          )}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-in">↓</div>
              <span className="text-[14.5px] font-bold">รับเข้าวันนี้</span>
            </div>
            <span className="text-[22px] font-bold">{receives?.length ?? 0} <span className="text-[13px] font-medium text-muted">ใบ</span></span>
          </div>
          <Link href="/receive" className="text-[12px] font-bold text-in">ดูทั้งหมด →</Link>
        </Card>
        <Card className="p-5">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-out">↑</div>
              <span className="text-[14.5px] font-bold">เบิกวัตถุดิบวันนี้</span>
            </div>
            <span className="text-[22px] font-bold">{withdraws?.length ?? 0} <span className="text-[13px] font-medium text-muted">ใบ</span></span>
          </div>
          <Link href="/dispatch" className="text-[12px] font-bold text-out">ดูทั้งหมด →</Link>
        </Card>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3.5 lg:grid-cols-5">
        <Card className="col-span-3 p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[14.5px] font-bold">การเคลื่อนไหวสินค้า</span>
            <div className="flex gap-3 text-[12px] text-zinc-600">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-in" />รับเข้า</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-out" />จ่ายออก</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={172}>
            <BarChart data={WEEKLY} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="in" fill="#2f9e6b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="out" fill="#d99a2b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="col-span-2 p-5">
          <div className="mb-4 text-[14.5px] font-bold">สัดส่วนต้นทุนตามหมวดวัตถุดิบ</div>
          <div className="flex flex-col gap-4">
            {CATEGORIES.map(c => (
              <div key={c.name}>
                <div className="mb-1.5 flex justify-between text-[12.5px]">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted">{c.pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4 text-[14.5px] font-bold">รายการเคลื่อนไหวล่าสุด</div>
        <div className="grid grid-cols-[120px_80px_1fr_90px_80px_100px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11.5px] font-bold uppercase tracking-wide text-muted">
          <span>เอกสาร</span><span>ประเภท</span><span>รายละเอียด</span>
          <span className="text-right">มูลค่า</span><span className="text-right">เวลา</span><span className="text-right">สถานะ</span>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted">ยังไม่มีรายการ — เชื่อม API ที่พอร์ต 3000</div>
        ) : recent.map((row, i) => (
          <div key={i} className="grid grid-cols-[120px_80px_1fr_90px_80px_100px] items-center gap-2 border-t border-line px-5 py-3 text-[13px]">
            <span className="font-mono font-semibold">{row.doc}</span>
            <Badge variant={row.typeVariant}>{row.type}</Badge>
            <span className="truncate">{row.desc}</span>
            <span className="text-right font-semibold">{row.qty}</span>
            <span className="text-right text-muted">{row.time}</span>
            <span className="text-right">{syncBadge(row.sync)}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}
