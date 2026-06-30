'use client'

import { useMemo, useState } from 'react'
import { Badge } from '../../../components/ui/Badge'
import { Card, PageHeader, SearchInput } from '../../../components/ui/PageHeader'
import { DateRangeBar, GcsDocButtons, MiniKpi } from '../../../components/ui/WarehouseControls'
import { buildStockRows, snapshotMeta, todayBangkok } from '../../../lib/trcloud-warehouse'
import { fmtNumber } from '../../../lib/format'

export default function StockPage() {
  const today = todayBangkok()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => buildStockRows(from, to, search), [from, to, search])
  const totals = useMemo(() => ({
    inbound: rows.reduce((sum, row) => sum + row.inboundQty, 0),
    outbound: rows.reduce((sum, row) => sum + row.outboundQty, 0),
    balance: rows.reduce((sum, row) => sum + row.balanceQty, 0),
    skuCount: new Set(rows.map(row => row.productId).filter(Boolean)).size,
    warehouseCount: new Set(rows.map(row => row.warehouse).filter(Boolean)).size,
  }), [rows])
  const grMeta = snapshotMeta('GR')
  const incMeta = snapshotMeta('INC')
  const mrMeta = snapshotMeta('MR')

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="สต็อคคลัง"
        subtitle="ยอดคงเหลือคำนวณจากเอกสารรับเข้า GR/INC ลบด้วยเอกสารจ่ายออก MR ที่ดึงจาก GCS โดย Python บน Cloud Run"
        actions={<GcsDocButtons docs={['GR', 'INC', 'MR', 'MANIFEST']} />}
      />

      <DateRangeBar from={from} to={to} onFromChange={setFrom} onToChange={setTo}>
        <div className="w-full min-w-[240px] max-w-sm">
          <SearchInput value={search} onChange={setSearch} placeholder="ค้นหา SKU / ชื่อสินค้า / คลัง" />
        </div>
      </DateRangeBar>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MiniKpi label="รับเข้า" value={fmtNumber(totals.inbound)} tone="in" />
        <MiniKpi label="จ่ายออก" value={fmtNumber(totals.outbound)} tone="out" />
        <MiniKpi label="คงเหลือสุทธิ" value={fmtNumber(totals.balance)} tone={totals.balance < 0 ? 'danger' : 'neutral'} />
        <MiniKpi label="SKU" value={fmtNumber(totals.skuCount)} />
        <MiniKpi label="คลัง" value={fmtNumber(totals.warehouseCount)} />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wide text-muted">ฐานคำนวณชั่วคราว</div>
            <div className="mt-1 text-[13px] text-muted">
              ตอนนี้ใช้ movement จากเอกสารที่มีอยู่แล้วก่อน ยังไม่รวม stock initial balance จริง
            </div>
          </div>
          <div className="grid gap-1 text-right text-[12px] text-muted sm:min-w-[360px]">
            <span>GR: {fmtNumber(grMeta.orderCount)} docs · INC: {fmtNumber(incMeta.orderCount)} docs · MR: {fmtNumber(mrMeta.orderCount)} docs</span>
            <span>ไฟล์ local ครอบคลุมประมาณ {grMeta.dateFrom || incMeta.dateFrom || mrMeta.dateFrom || '-'} ถึง {grMeta.dateTo || incMeta.dateTo || mrMeta.dateTo || '-'}</span>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[130px_1fr_170px_90px_110px_110px_120px_90px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11.5px] font-bold uppercase text-muted">
          <span>SKU</span>
          <span>สินค้า</span>
          <span>คลัง</span>
          <span>หน่วย</span>
          <span className="text-right">รับเข้า</span>
          <span className="text-right">จ่ายออก</span>
          <span className="text-right">คงเหลือ</span>
          <span className="text-right">ล่าสุด</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted">
            ไม่พบ movement สำหรับคำนวณสต็อคในช่วงวันที่ที่เลือก
          </div>
        ) : rows.slice(0, 160).map(row => {
          const negative = row.balanceQty < 0
          return (
            <div
              key={row.key}
              className="grid grid-cols-[130px_1fr_170px_90px_110px_110px_120px_90px] items-center gap-2 border-t border-line px-5 py-3 text-[13px]"
            >
              <span className="truncate font-mono font-semibold">{row.productId}</span>
              <span className="min-w-0 truncate font-medium">{row.productName}</span>
              <span className="truncate text-[12px] text-muted">{row.warehouse}</span>
              <span className="text-[12px] text-muted">{row.unit || '-'}</span>
              <span className="text-right font-semibold text-in">{fmtNumber(row.inboundQty)}</span>
              <span className="text-right font-semibold text-out">{fmtNumber(row.outboundQty)}</span>
              <span className="text-right">
                {negative ? (
                  <Badge variant="error">{fmtNumber(row.balanceQty)}</Badge>
                ) : (
                  <span className="font-bold">{fmtNumber(row.balanceQty)}</span>
                )}
              </span>
              <span className="text-right font-mono text-[12px] text-muted">{row.lastDate || '-'}</span>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
