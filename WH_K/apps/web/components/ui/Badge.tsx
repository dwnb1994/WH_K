import { cn } from '../../lib/cn'

const variants = {
  in: 'bg-emerald-50 text-emerald-700',
  out: 'bg-amber-50 text-amber-700',
  adjust: 'bg-violet-50 text-violet-700',
  pending: 'bg-slate-100 text-slate-600',
  synced: 'bg-emerald-50 text-emerald-700',
  error: 'bg-red-50 text-red-700',
  warn: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
} as const

export function Badge({
  children,
  variant = 'pending',
  className,
}: {
  children: React.ReactNode
  variant?: keyof typeof variants
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
