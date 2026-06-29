'use client'

import { Sidebar } from './Sidebar'
import { useSyncStatus } from '@warehouse/api-client/hooks'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: sync } = useSyncStatus()

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar syncErrorCount={sync?.counts?.ERROR ?? 0} />
      <main className="min-w-0 flex-1 overflow-auto px-7 py-6">{children}</main>
    </div>
  )
}
