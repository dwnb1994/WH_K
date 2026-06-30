import { GCS_DOC_URLS, type DocType } from '../../lib/trcloud-warehouse'

export function GcsDocButtons({ docs }: { docs: Array<DocType | 'MANIFEST'> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {docs.map(doc => (
        <a
          key={doc}
          href={GCS_DOC_URLS[doc]}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center rounded-[10px] border border-line bg-white px-3 text-[12.5px] font-semibold text-zinc-700 transition-colors hover:bg-surface"
        >
          ดูเอกสาร GCS: {doc === 'MANIFEST' ? 'Manifest' : doc}
        </a>
      ))}
    </div>
  )
}

export function DateRangeBar({
  from,
  to,
  onFromChange,
  onToChange,
  children,
}: {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  children?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-[12px] border border-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
            จากวันที่
          </span>
          <input
            type="date"
            value={from}
            onChange={event => onFromChange(event.target.value)}
            className="h-10 rounded-[9px] border border-line bg-[#fafafb] px-3 text-[13px] font-semibold text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
            ถึงวันที่
          </span>
          <input
            type="date"
            value={to}
            onChange={event => onToChange(event.target.value)}
            className="h-10 rounded-[9px] border border-line bg-[#fafafb] px-3 text-[13px] font-semibold text-ink outline-none focus:border-brand"
          />
        </label>
      </div>
      {children}
    </div>
  )
}

export function MiniKpi({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  tone?: 'neutral' | 'in' | 'out' | 'danger'
}) {
  const toneClass = {
    neutral: 'text-ink',
    in: 'text-in',
    out: 'text-out',
    danger: 'text-danger',
  }[tone]

  return (
    <div className="rounded-[12px] border border-line bg-white p-4">
      <div className="text-[12px] font-semibold text-muted">{label}</div>
      <div className={`mt-1 text-[24px] font-bold tracking-tight ${toneClass}`}>{value}</div>
    </div>
  )
}
