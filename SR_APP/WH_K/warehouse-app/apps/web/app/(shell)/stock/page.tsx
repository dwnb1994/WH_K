'use client'

import { useMemo, useState } from 'react'
import { Badge } from '../../../components/ui/Badge'
import { Card, PageHeader, SearchInput } from '../../../components/ui/PageHeader'
import { DateRangeBar, GcsDocButtons, MiniKpi } from '../../../components/ui/WarehouseControls'
import {
  buildSimulatedStockRows,
  getDailyStockChanges,
  stockSimulationMeta,
} from '../../../lib/trcloud-warehouse'
import { useWarehouse } from '../../../lib/warehouse-context'
import { fmtNumber } from '../../../lib/format'

export default function StockPage() {
  const { warehouse } = useWarehouse()
  const simMeta = stockSimulationMeta()
  const [from, setFrom] = useState(simMeta.period.date_from)
  const [to, setTo] = useState(simMeta.period.date_to)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => buildSimulatedStockRows(from, to, search, warehouse), [from, to, search, warehouse])
  const dailyRows = useMemo(() => getDailyStockChanges(from, to, warehouse), [from, to, warehouse])
  const totals = useMemo(() => ({
    base: rows.reduce((sum, row) => sum + row.baseQty, 0),
    inbound: rows.reduce((sum, row) => sum + row.inboundQty, 0),
    outbound: rows.reduce((sum, row) => sum + row.outboundQty, 0),
    balance: rows.reduce((sum, row) => sum + row.balanceQty, 0),
    skuCount: new Set(rows.map(row => row.productId).filter(Boolean)).size,
    warehouseCount: new Set(rows.map(row => row.warehouse).filter(Boolean)).size,
  }), [rows])
  const selectDay = (date: string) => {
    setFrom(date)
    setTo(date)
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="สต็อคคลัง"
        subtitle={`ฐานถึง ${simMeta.base.date_to} จาก GR/INC และ movement ${simMeta.period.date_from} ถึง ${simMeta.period.date_to} จาก GR/INC/MR`}
        actions={<GcsDocButtons docs={['GR', 'INC', 'MR', 'MANIFEST']} />}
      />

      <DateRangeBar from={from} to={to} onFromChange={setFrom} onToChange={setTo}>
        <div className="w-full min-w-[240px] max-w-sm">
          <SearchInput value={search} onChange={setSearch} placeholder="ค้นหา SKU / ชื่อสินค้า / คลัง" />
        </div>
      </DateRangeBar>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MiniKpi label={`ฐาน ${simMeta.base.date_to}`} value={fmtNumber(totals.base)} />
        <MiniKpi label="รับเข้าในช่วง" value={fmtNumber(totals.inbound)} tone="in" />
        <MiniKpi label="จ่ายออกในช่วง" value={fmtNumber(totals.outbound)} tone="out" />
        <MiniKpi label="คงเหลือปลายช่วง" value={fmtNumber(totals.balance)} tone={totals.balance < 0 ? 'danger' : 'neutral'} />
        <MiniKpi label="SKU" value={fmtNumber(totals.skuCount)} />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wide text-muted">Stock simulation จาก GCS</div>
            <div className="mt-1 text-[13px] text-muted">
              ฐานทดสอบใช้เฉพาะ GR/INC ถึงสิ้นเดือนก่อน แล้วใช้ GR/INC/MR ของเดือนนี้ขยับยอดรายวัน
            </div>
          </div>
          <div className="grid gap-1 text-right text-[12px] text-muted sm:min-w-[360px]">
            <span>Source: {simMeta.source}{simMeta.bucket ? ` · ${simMeta.bucket}` : ''}</span>
            <span>Base lines: {fmtNumber(simMeta.sourceCounts.baseLines)} · Movement lines: {fmtNumber(simMeta.sourceCounts.movementLines)} · คลัง: {fmtNumber(totals.warehouseCount)}</span>
          </div>
        </div>
      </Card>

      <Card className="mb-4 overflow-hidden">
        <div className="grid grid-cols-[100px_100px_100px_100px_100px_80px_80px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11.5px] font-bold uppercase text-muted">
          <span>วันที่</span>
          <span className="text-right">รับเข้า</span>
          <span className="text-right">จ่ายออก</span>
          <span className="text-right">สุทธิ</span>
          <span className="text-right">คงเหลือ</span>
          <span className="text-right">SKU</span>
          <span className="text-right">Lines</span>
        </div>
        {dailyRows.length === 0 ? (
          <div className="px-5 py-6 text-center text-[13px] text-muted">ไม่มี movement รายวันในช่วงที่เลือก</div>
        ) : dailyRows.map(day => (
          <button
            key={day.date}
            type="button"
            onClick={() => selectDay(day.date)}
            className="grid w-full grid-cols-[100px_100px_100px_100px_100px_80px_80px] items-center gap-2 border-t border-line px-5 py-2.5 text-left text-[12.5px] transition hover:bg-surface"
          >
            <span className="font-mono font-semibold">{day.date}</span>
            <span className="text-right font-semibold text-in">{fmtNumber(day.inboundQty)}</span>
            <span className="text-right font-semibold text-out">{fmtNumber(day.outboundQty)}</span>
            <span className={`text-right font-bold ${day.netQty < 0 ? 'text-danger' : 'text-ink'}`}>{fmtNumber(day.netQty)}</span>
            <span className="text-right font-mono">{fmtNumber(day.closingQty)}</span>
            <span className="text-right text-muted">{fmtNumber(day.skuCount)}</span>
            <span className="text-right text-muted">{fmtNumber(day.movementCount)}</span>
          </button>
        ))}
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[130px_1fr_170px_80px_100px_100px_100px_110px_90px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11.5px] font-bold uppercase text-muted">
          <span>SKU</span>
          <span>สินค้า</span>
          <span>คลัง</span>
          <span>หน่วย</span>
          <span className="text-right">ฐาน</span>
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
              className="grid grid-cols-[130px_1fr_170px_80px_100px_100px_100px_110px_90px] items-center gap-2 border-t border-line px-5 py-3 text-[13px]"
            >
              <span className="truncate font-mono font-semibold">{row.productId}</span>
              <span className="min-w-0 truncate font-medium">{row.productName}</span>
              <span className="truncate text-[12px] text-muted">{row.warehouse}</span>
              <span className="text-[12px] text-muted">{row.unit || '-'}</span>
              <span className="text-right font-mono text-[12px] text-muted">{fmtNumber(row.baseQty)}</span>
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
