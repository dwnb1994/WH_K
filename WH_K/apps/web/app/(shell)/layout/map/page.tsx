'use client'

import { useState } from 'react'
import {
  WAREHOUSE_MAP, MAP_TOP_IDS, MAP_LEFT_IDS, MAP_RIGHT_IDS,
  getMapBox, type MapMode, type MapItem,
} from '../../../../lib/warehouse-map-data'
import { PageHeader, Card, Btn } from '../../../../components/ui/PageHeader'
import { cn } from '../../../../lib/cn'

function boxLabel(id: string, index: number, prefix: string): string {
  const known = getMapBox(id)
  if (known) return known.label
  const n = index + 1
  return `${prefix}-${String(n).padStart(2, '0')}`
}

function MapCell({
  id,
  label,
  selected,
  hasData,
  onClick,
}: {
  id: string
  label: string
  selected: boolean
  hasData: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex min-h-[50px] items-center justify-center rounded-lg border text-[13.5px] font-semibold transition-colors',
        selected ? 'border-brand ring-2 ring-brand/30' : 'border-zinc-300 bg-white hover:bg-surface',
      )}
    >
      {hasData && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-in" />
      )}
      {label}
    </button>
  )
}

export default function LayoutMapPage() {
  const [mode, setMode] = useState<MapMode>('in')
  const [selectedId, setSelectedId] = useState('box13')

  const selBox = getMapBox(selectedId)
  const items = selBox ? (mode === 'in' ? selBox.itemsIn : selBox.itemsOut) : []

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="แผนผังช่องเก็บของ"
        subtitle={`คลิกที่ช่องเพื่อดูสินค้า${mode === 'in' ? 'รับเข้า' : 'จ่ายออก'} · ห้อง A · DC-BKK`}
        actions={
          <div className="flex items-center gap-4">
            <div className="flex rounded-[10px] bg-surface p-1">
              <button
                type="button"
                onClick={() => setMode('in')}
                className={cn(
                  'rounded-lg px-4 py-1.5 text-[12px] font-semibold',
                  mode === 'in' ? 'bg-brand text-white' : 'text-zinc-600',
                )}
              >
                รับเข้า
              </button>
              <button
                type="button"
                onClick={() => setMode('out')}
                className={cn(
                  'rounded-lg px-4 py-1.5 text-[12px] font-semibold',
                  mode === 'out' ? 'bg-brand text-white' : 'text-zinc-600',
                )}
              >
                จ่ายออก
              </button>
            </div>
            <span className="flex items-center gap-1.5 text-[12px] text-zinc-600">
              <span className="h-2 w-2 rounded-full bg-in" />มีข้อมูล
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_320px]">
        <Card className="p-5">
          <div className="mb-2 grid grid-cols-3 gap-2">
            {MAP_TOP_IDS.map((id, i) => {
              const box = getMapBox(id)
              const hasData = box ? (mode === 'in' ? box.itemsIn.length : box.itemsOut.length) > 0 : false
              return (
                <MapCell
                  key={id}
                  id={id}
                  label={boxLabel(id, i, 'A')}
                  selected={selectedId === id}
                  hasData={hasData}
                  onClick={() => setSelectedId(id)}
                />
              )
            })}
          </div>

          <div className="my-3 flex items-center gap-2">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">ทางเดิน · Aisle</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="flex gap-0">
            <div className="grid flex-1 grid-cols-3 gap-2">
              {MAP_LEFT_IDS.map((id, i) => {
                const box = getMapBox(id)
                const hasData = box ? (mode === 'in' ? box.itemsIn.length : box.itemsOut.length) > 0 : false
                return (
                  <MapCell
                    key={id}
                    id={id}
                    label={boxLabel(id, i, 'A')}
                    selected={selectedId === id}
                    hasData={hasData}
                    onClick={() => setSelectedId(id)}
                  />
                )
              })}
            </div>
            <div className="flex w-10 shrink-0 items-center justify-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300 [writing-mode:vertical-rl]">
                ทางเดิน
              </span>
            </div>
            <div className="grid flex-1 grid-cols-3 gap-2">
              {MAP_RIGHT_IDS.map((id, i) => {
                const box = getMapBox(id)
                const hasData = box ? (mode === 'in' ? box.itemsIn.length : box.itemsOut.length) > 0 : false
                return (
                  <MapCell
                    key={id}
                    id={id}
                    label={boxLabel(id, i, 'B')}
                    selected={selectedId === id}
                    hasData={hasData}
                    onClick={() => setSelectedId(id)}
                  />
                )
              })}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="bg-brand px-5 py-4 text-white">
            <div className="text-[11.5px] text-white/55">ช่องที่เลือก</div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-[23px] font-bold tracking-tight">
                {selBox?.label ?? boxLabel(selectedId, 0, '—')}
              </div>
              <div className="font-mono text-[12px] text-emerald-300">{selBox?.code ?? '—'}</div>
            </div>
            <div className="mt-1 text-[12px] text-white/60">
              {items.length} รายการ · โหมด{mode === 'in' ? 'รับเข้า' : 'จ่ายออก'}
            </div>
          </div>

          {items.length > 0 ? (
            <div className="p-4">
              <div className="mb-3 text-[11.5px] font-bold uppercase tracking-wide text-muted">
                {mode === 'in' ? 'สินค้ารับเข้า' : 'สินค้าจ่ายออก'}
              </div>
              <div className="flex flex-col gap-2">
                {items.map((it: MapItem, i: number) => (
                  <div key={i} className="rounded-[11px] border border-line p-3">
                    <div className="flex justify-between gap-2">
                      <div className="text-[13.5px] font-bold leading-snug">{it.name}</div>
                      <div className={`text-[13px] font-bold ${mode === 'in' ? 'text-in' : 'text-out'}`}>
                        {mode === 'in' ? '+' : '−'}{it.qty} {it.unit}
                      </div>
                    </div>
                    <div className="mt-1 font-mono text-[11.5px] text-muted">{it.sku} · {it.doc}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-400">{it.date}</div>
                  </div>
                ))}
              </div>
              <Btn className="mt-4 w-full justify-center">ดูรายละเอียด</Btn>
            </div>
          ) : (
            <div className="px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[13px] bg-surface text-zinc-400">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5v-9zM3 7.5l9 4.5 9-4.5M12 12v9" />
                </svg>
              </div>
              <div className="text-[13.5px] font-semibold text-zinc-600">ไม่มีข้อมูลในโหมดนี้</div>
              <div className="mt-1 text-[12px] text-muted">ลองเลือกช่องอื่น หรือสลับโหมด</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
