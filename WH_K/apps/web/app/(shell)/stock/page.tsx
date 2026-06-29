'use client'

import { useState } from 'react'
import { useStock } from '@warehouse/api-client/hooks'
import type { StockPosition } from '@warehouse/types'
import { PageHeader, Card, Btn, SearchInput } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { fmtNumber } from '../../../lib/format'

type StockRow = StockPosition & {
  items?: { sku?: string; name?: string }
  warehouses?: { code?: string }
  on_hand?: number
  bin_code?: string
}

export default function StockPage() {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useStock(undefined, search || undefined)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="สต็อกคงคลังโรงครัว"
        subtitle="ยอดคงเหลือแยกตามคลังโรงครัวและตำแหน่ง bin"
        actions={
          <>
            <Btn variant="secondary">Export Excel</Btn>
            <Btn>เปิดรอบตรวจนับ</Btn>
          </>
        }
      />

      <div className="mb-4 flex justify-end">
        <div className="w-full max-w-sm">
          <SearchInput value={search} onChange={setSearch} placeholder="ค้นหา SKU / ชื่อสินค้า..." />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[100px_1fr_80px_80px_80px_80px_90px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11.5px] font-bold uppercase text-muted">
          <span>SKU</span><span>ชื่อสินค้า</span><span>คลังโรงครัว</span><span>Bin</span>
          <span className="text-right">คงเหลือ</span><span className="text-right">จอง</span><span className="text-right">พร้อมใช้</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted">กำลังโหลด...</div>
        ) : !data?.length ? (
          <div className="p-8 text-center text-[13px] text-muted">ไม่พบสต็อก — ตรวจสอบการเชื่อมต่อ API / Supabase</div>
        ) : (data as StockRow[]).map(row => {
          const item = row.item ?? row.items
          const wh = row.warehouse ?? row.warehouses
          const onHand = Number(row.onHand ?? row.on_hand ?? 0)
          const reserved = Number(row.reserved ?? 0)
          const available = onHand - reserved
          const low = available <= 0
          return (
            <div
              key={row.id}
              className="grid grid-cols-[100px_1fr_80px_80px_80px_80px_90px] items-center gap-2 border-t border-line px-5 py-3.5 text-[13px]"
            >
              <span className="font-mono font-semibold">{item?.sku ?? '—'}</span>
              <span className="font-medium">{item?.name ?? '—'}</span>
              <span className="font-mono text-[12px] text-muted">{wh?.code ?? '—'}</span>
              <span className="font-mono text-[12px]">{row.binCode ?? row.bin_code ?? '—'}</span>
              <span className={`text-right font-bold ${low ? 'text-danger' : ''}`}>{fmtNumber(onHand)}</span>
              <span className="text-right text-muted">{fmtNumber(reserved)}</span>
              <span className="text-right">
                {low ? <Badge variant="error">{fmtNumber(available)}</Badge> : fmtNumber(available)}
              </span>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
