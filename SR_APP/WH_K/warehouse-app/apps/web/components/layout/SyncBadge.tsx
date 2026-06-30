'use client'

import { useSyncStatus } from '@warehouse/api-client/hooks'

export function SyncBadge() {
  const { data: sync } = useSyncStatus()
  const errors = sync?.counts?.ERROR ?? 0

  if (!errors) return null

  return (
    <span className="rounded-full bg-danger px-1.5 py-px text-[10px] font-bold text-white">
      {errors}
    </span>
  )
}
