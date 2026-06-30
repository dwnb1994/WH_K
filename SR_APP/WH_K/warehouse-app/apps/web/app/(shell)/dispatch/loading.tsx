export default function DispatchLoading() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 h-14 animate-pulse rounded-[12px] border border-line bg-white" />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-[12px] border border-line bg-white" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-[520px] animate-pulse rounded-[14px] border border-line bg-white" />
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-[14px] border border-line bg-white" />
          <div className="h-64 animate-pulse rounded-[14px] border border-line bg-white" />
        </div>
      </div>
    </div>
  )
}
