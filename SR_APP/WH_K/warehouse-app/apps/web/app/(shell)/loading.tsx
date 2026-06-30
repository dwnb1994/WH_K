function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[14px] bg-zinc-100 ${className}`} />
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 border border-line bg-white" />
        ))}
      </div>
      <Skeleton className="mt-4 h-64 border border-line bg-white" />
    </div>
  )
}
