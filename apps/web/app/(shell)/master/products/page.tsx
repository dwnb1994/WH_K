'use client'

import { useState } from 'react'
import { useItems } from '@warehouse/api-client/hooks'
import { PageHeader, Card, Btn, SearchInput } from '../../../../components/ui/PageHeader'
import { fmtNumber } from '../../../../lib/format'

export default function MasterProductsPage() {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useItems(search || undefined)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="ข้อมูลหลัก (Master Data)"
        subtitle={`สินค้าทั้งหมด ${data?.length ?? 0} รายการ · ซิงก์จาก TRCloud`}
        actions={
          <>
            <Btn variant="secondary">ซิงก์จาก TRCloud</Btn>
            <Btn>+ เพิ่มสินค้า</Btn>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2 border-b border-line pb-3">
        <span className="border-b-2 border-brand pb-2 text-[13.5px] font-bold">สินค้า</span>
        <span className="px-3 pb-2 text-[13.5px] text-muted">ซัพพลายเออร์</span>
        <span className="px-3 pb-2 text-[13.5px] text-muted">หมวดหมู่</span>
        <div className="ml-auto w-full max-w-xs">
          <SearchInput value={search} onChange={setSearch} placeholder="ค้นหา SKU / ชื่อสินค้า..." />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[100px_1fr_110px_60px_70px_70px_60px] gap-2 bg-[#fafafb] px-5 py-2.5 text-[11px] font-bold uppercase text-muted">
          <span>SKU</span><span>ชื่อสินค้า</span><span>หมวด</span><span>หน่วย</span>
          <span className="text-right">จุดสั่ง</span><span className="text-right">คงเหลือ</span><span className="text-right">สถานะ</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted">กำลังโหลด...</div>
        ) : !data?.length ? (
          <div className="p-8 text-center text-[13px] text-muted">ไม่พบสินค้าในระบบ</div>
        ) : data.map(item => (
          <div
            key={item.id}
            className="grid grid-cols-[100px_1fr_110px_60px_70px_70px_60px] items-center gap-2 border-t border-line px-5 py-3 text-[13px]"
          >
            <span className="font-mono font-semibold">{item.sku}</span>
            <span className="font-medium">{item.name}</span>
            <span className="text-zinc-600">{item.category ?? '—'}</span>
            <span className="text-zinc-600">{item.unit}</span>
            <span className="text-right text-zinc-600">{fmtNumber(Number(item.min_qty))}</span>
            <span className={`text-right font-bold ${item.stock_status === 'LOW' ? 'text-out' : ''}`}>
              {fmtNumber(item.on_hand)}
            </span>
            <span className="text-right">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  item.on_hand <= 0 ? 'bg-danger' : item.stock_status === 'LOW' ? 'bg-out' : 'bg-in'
                }`}
              />
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}
