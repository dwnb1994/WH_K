export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-[14px] border border-line bg-white" />
        ))}
      </div>
      <div className="mb-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className="h-24 animate-pulse rounded-[14px] border border-line bg-white" />
        <div className="h-24 animate-pulse rounded-[14px] border border-line bg-white" />
      </div>
      <div className="mb-5 grid grid-cols-1 gap-3.5 lg:grid-cols-5">
        <div className="h-56 animate-pulse rounded-[14px] border border-line bg-white lg:col-span-3" />
        <div className="h-56 animate-pulse rounded-[14px] border border-line bg-white lg:col-span-2" />
      </div>
      <div className="h-48 animate-pulse rounded-[14px] border border-line bg-white" />
    </div>
  )
}
