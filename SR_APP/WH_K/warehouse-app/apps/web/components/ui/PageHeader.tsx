import { cn } from '../../lib/cn'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  hint,
  hintTone = 'neutral',
  accent,
}: {
  label: string
  value: string
  hint?: string
  hintTone?: 'neutral' | 'good' | 'warn' | 'danger'
  accent?: string
}) {
  const hintClass = {
    neutral: 'text-muted',
    good: 'text-in',
    warn: 'text-out',
    danger: 'text-danger',
  }[hintTone]

  return (
    <div
      className="rounded-[14px] border border-line bg-white p-4"
      style={accent ? { borderLeftWidth: 4, borderLeftColor: accent } : undefined}
    >
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className="mt-1.5 text-[25px] font-bold tracking-tight text-ink">{value}</div>
      {hint && <div className={cn('mt-1 text-[11.5px] font-semibold', hintClass)}>{hint}</div>}
    </div>
  )
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[14px] border border-line bg-white', className)}>
      {children}
    </div>
  )
}

export function Btn({
  children,
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-colors',
        variant === 'primary' && 'bg-brand text-white hover:bg-zinc-800',
        variant === 'secondary' && 'border border-line bg-white text-zinc-700 hover:bg-surface',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-[#fafafb] px-3 py-2">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9a9aa6" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-muted"
      />
    </div>
  )
}
