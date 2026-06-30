'use client'

import { useMemo, useState } from 'react'
import { Badge } from '../../../components/ui/Badge'
import { Card, PageHeader, SearchInput } from '../../../components/ui/PageHeader'
import { DateRangeBar, GcsDocButtons, MiniKpi } from '../../../components/ui/WarehouseControls'
import {
  docsSummary,
  getDocs,
  getLines,
  snapshotMeta,
  summarizeByWarehouse,
  todayBangkok,
} from '../../../lib/trcloud-warehouse'
import { fmtNumber } from '../../../lib/format'

export default function DispatchPage() {
  const today = todayBangkok()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [search, setSearch] = useState('')

  const docs = useMemo(() => getDocs(['MR'], from, to, search), [from, to, search])
  const lines = useMemo(() => getLines(['MR'], from, to, search), [from, to, search])
  const summary = useMemo(() => docsSummary(docs, lines), [docs, lines])
  const warehouseRows = useMemo(() => summarizeByWarehouse(lines), [lines])
  const mrMeta = snapshotMeta('MR')

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="จ่ายออกจากคลัง"
        subtitle="รายการจ่ายออกตามช่วงเวลา จากเอกสาร MR ที่ดึงด้วย Python บน Cloud Run แล้วเก็บไว้ใน GCS"
        actions={<GcsDocButtons docs={['MR']} />}
      />

      <DateRangeBar from={from} to={to} onFromChange={setFrom} onToChange={setTo}>
        <div className="w-full min-w-[240px] max-w-sm">
          <SearchInput value={search} onChange={setSearch} placeholder="ค้นหา MR / สินค้า / คลัง / ผู้เบิก" />
        </div>
      </DateRangeBar>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MiniKpi label="เอกสารจ่ายออก" value={fmtNumber(summary.docCount)} tone="out" />
        <MiniKpi label="รายการสินค้า" value={fmtNumber(summary.lineCount)} />
        <MiniKpi label="จำนวนจ่ายออก" value={fmtNumber(summary.qty)} tone="out" />
        <MiniKpi label="SKU" value={fmtNumber(summary.skuCount)} />
        <MiniKpi label="คลังที่เกี่ยวข้อง" value={fmtNumber(summary.warehouseCount)} />
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[92px_130px_1fr_160px_120px_110px_110px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11.5px] font-bold uppercase text-muted">
            <span>ชนิด</span>
            <span>เอกสาร</span>
            <span>ผู้เบิก / โครงการ</span>
            <span>คลัง</span>
            <span>วันที่</span>
            <span className="text-right">รายการ</span>
            <span className="text-right">จำนวน</span>
          </div>
          {docs.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-muted">
              ไม่พบเอกสารจ่ายออกในช่วงวันที่ที่เลือก
            </div>
          ) : docs.slice(0, 120).map(doc => (
            <div
              key={`${doc.docType}-${doc.docId}`}
              className="grid grid-cols-[92px_130px_1fr_160px_120px_110px_110px] items-center gap-2 border-t border-line px-5 py-3 text-[13px]"
            >
              <span><Badge variant="out">MR</Badge></span>
              <span className="font-mono font-bold text-out">{doc.docRef || '-'}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{doc.requester || '-'}</span>
                <span className="block truncate text-[11.5px] text-muted">{doc.project || doc.department || '-'}</span>
              </span>
              <span className="truncate text-[12px] text-muted">{doc.warehouse || '-'}</span>
              <span className="font-mono text-[12px]">{doc.date || '-'}</span>
              <span className="text-right">{fmtNumber(doc.lineCount)}</span>
              <span className="text-right font-semibold">{fmtNumber(doc.totalQty)}</span>
            </div>
          ))}
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <div className="text-[12px] font-bold uppercase tracking-wide text-muted">Snapshot local</div>
            <div className="mt-3 grid gap-2 text-[12.5px]">
              <div className="flex justify-between gap-3"><span>MR</span><span className="font-mono">{fmtNumber(mrMeta.orderCount)} docs / {fmtNumber(mrMeta.lineCount)} lines</span></div>
              <div className="border-t border-line pt-2 text-muted">ช่วงไฟล์: {mrMeta.dateFrom || '-'} ถึง {mrMeta.dateTo || '-'}</div>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="bg-[#fafafb] px-4 py-2.5 text-[11.5px] font-bold uppercase text-muted">สรุปจ่ายออกตามคลัง</div>
            {warehouseRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-muted">ไม่มี movement</div>
            ) : warehouseRows.slice(0, 8).map(row => (
              <div key={row.warehouse} className="border-t border-line px-4 py-3 text-[13px]">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{row.warehouse}</span>
                  <span className="font-bold text-out">{fmtNumber(row.qty)}</span>
                </div>
                <div className="mt-1 text-[11.5px] text-muted">{fmtNumber(row.docCount)} เอกสาร · {fmtNumber(row.lineCount)} lines</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
