'use client'

import type { ReactNode } from 'react'
import { fmtMoney } from '../../lib/format'

export type LineColumn = {
  key: string
  label: string
  align?: 'left' | 'right'
  width?: string
  render?: (row: Record<string, unknown>) => ReactNode
}

type LineItemsPanelProps = {
  lines: Array<Record<string, unknown>>
  isLoading?: boolean
  error?: boolean
  emptyText?: string
  columns: LineColumn[]
  footer?: ReactNode
}

function cellValue(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  if (v == null || v === '') return '—'
  return String(v)
}

function moneyBaht(row: Record<string, unknown>, key: string, rawKey?: string): string {
  const baht = row[key]
  if (baht != null && baht !== '') return fmtMoney(Number(baht))
  const raw = Number(row[rawKey ?? ''] ?? 0)
  if (!raw) return '—'
  return fmtMoney(raw > 100000 ? raw / 100 : raw)
}

export function LineItemsPanel({
  lines,
  isLoading,
  error,
  emptyText = 'ไม่พบรายการสินค้า',
  columns,
  footer,
}: LineItemsPanelProps) {
  const gridCols = columns
    .map(c => c.width ?? (c.align === 'right' ? '88px' : '1fr'))
    .join(' ')

  const lineTotal = lines.reduce((s, ln) => s + Number(ln.line_total_baht ?? 0), 0)

  if (isLoading) {
    return (
      <div className="border-t border-line bg-surface/60 px-5 py-4 text-[13px] text-muted">
        กำลังโหลดรายการสินค้า...
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
  if (!lines.length) {
    return (
      <div className="border-t border-line bg-surface/60 px-5 py-4 text-[13px] text-muted">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="border-t border-line bg-[#fafafb]">
      <div
        className="grid gap-2 px-5 py-2 text-[11px] font-bold uppercase text-muted"
        style={{ gridTemplateColumns: gridCols }}
      >
        {columns.map(col => (
          <span key={col.key} className={col.align === 'right' ? 'text-right' : ''}>
            {col.label}
          </span>
        ))}
      </div>
      {lines.map((ln, i) => (
        <div
          key={`${ln.line_no ?? i}-${ln.product_id ?? i}`}
          className="grid gap-2 border-t border-line/80 px-5 py-2.5 text-[13px]"
          style={{ gridTemplateColumns: gridCols }}
        >
          {columns.map(col => (
            <span key={col.key} className={col.align === 'right' ? 'text-right' : ''}>
              {col.render ? col.render(ln) : cellValue(ln, col.key)}
            </span>
          ))}
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[12px]">
        <span className="text-muted">{lines.length} รายการ</span>
        {lineTotal > 0 ? (
          <span className="font-semibold text-ink">รวม {fmtMoney(lineTotal)}</span>
        ) : null}
      </div>
      {footer}
    </div>
  )
}

const productCell: LineColumn['render'] = row => (
  <div>
    <p className="font-medium text-ink">{String(row.product_name ?? row.description ?? '—')}</p>
    <p className="mt-0.5 font-mono text-[11px] text-muted">
      {row.product_id ? String(row.product_id) : '—'}
      {row.category_code ? ` · ${String(row.category_code)}` : ''}
    </p>
  </div>
)

export const PO_LINE_COLUMNS: LineColumn[] = [
  { key: 'line_no', label: '#', width: '36px', align: 'right' },
  { key: 'product_name', label: 'สินค้า', render: productCell },
  { key: 'quantity', label: 'จำนวน', align: 'right', width: '72px' },
  { key: 'unit', label: 'หน่วย', width: '64px' },
  {
    key: 'unit_cost_baht',
    label: 'ราคา/หน่วย',
    align: 'right',
    width: '100px',
    render: row => moneyBaht(row, 'unit_cost_baht', 'price'),
  },
  {
    key: 'line_total_baht',
    label: 'รวม',
    align: 'right',
    width: '100px',
    render: row => (
      <span className="font-semibold">{moneyBaht(row, 'line_total_baht', 'item_total')}</span>
    ),
  },
]

export const GR_LINE_COLUMNS: LineColumn[] = [
  { key: 'line_no', label: '#', width: '36px', align: 'right' },
  { key: 'product_name', label: 'วัตถุดิบ', render: productCell },
  { key: 'quantity', label: 'จำนวน', align: 'right', width: '72px' },
  { key: 'unit', label: 'หน่วย', width: '64px' },
  {
    key: 'unit_cost_baht',
    label: 'ราคา/หน่วย',
    align: 'right',
    width: '100px',
    render: row => moneyBaht(row, 'unit_cost_baht', 'price_raw'),
  },
  {
    key: 'line_total_baht',
    label: 'รวม',
    align: 'right',
    width: '100px',
    render: row => (
      <span className="font-semibold">{moneyBaht(row, 'line_total_baht', 'item_total_raw')}</span>
    ),
  },
  { key: 'serial', label: 'Serial/Lot', width: '110px' },
  { key: 'warehouse', label: 'คลัง', width: '100px' },
]

export const MR_LINE_COLUMNS: LineColumn[] = [
  { key: 'line_no', label: '#', width: '36px', align: 'right' },
  { key: 'product_name', label: 'วัตถุดิบ', render: productCell },
  { key: 'quantity', label: 'จำนวน', align: 'right', width: '72px' },
  { key: 'unit', label: 'หน่วย', width: '64px' },
  {
    key: 'unit_cost_baht',
    label: 'ทุน/หน่วย',
    align: 'right',
    width: '100px',
    render: row => moneyBaht(row, 'unit_cost_baht', 'price_raw'),
  },
  {
    key: 'line_total_baht',
    label: 'ต้นทุนรวม',
    align: 'right',
    width: '100px',
    render: row => (
      <span className="font-semibold">{moneyBaht(row, 'line_total_baht', 'item_total_raw')}</span>
    ),
  },
  { key: 'remark', label: 'หมายเหตุ', width: '120px' },
]

export const INC_LINE_COLUMNS: LineColumn[] = [
  { key: 'line_no', label: '#', width: '36px', align: 'right' },
  { key: 'product_name', label: 'วัตถุดิบ', render: productCell },
  { key: 'quantity', label: 'จำนวน', align: 'right', width: '72px' },
  { key: 'unit', label: 'หน่วย', width: '64px' },
  { key: 'po_ref', label: 'PO', width: '110px' },
  { key: 'serial', label: 'Serial', width: '110px' },
  { key: 'warehouse', label: 'คลัง', width: '100px' },
]

export function ExpandToggle({
  expanded,
  onToggle,
  label,
}: {
  expanded: boolean
  onToggle: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? 'ย่อรายการ' : label ?? 'ดูรายการสินค้า'}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-lg font-bold transition ${
        expanded
          ? 'border-brand bg-brand text-white'
          : 'border-line bg-white text-brand hover:border-brand'
      }`}
    >
      {expanded ? '−' : '+'}
    </button>
  )
}

export function OrderValue({ baht }: { baht?: number | null }) {
  if (baht == null || !baht) return <span className="text-muted">—</span>
  return <span className="font-semibold">{fmtMoney(baht)}</span>
}
