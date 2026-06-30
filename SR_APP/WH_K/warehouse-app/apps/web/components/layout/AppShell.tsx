import { Sidebar } from './Sidebar'
import { SyncStatusBar } from '../ui/SyncStatusBar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto px-7 py-6">
        <SyncStatusBar />
        {children}
      </main>
    </div>
  )
}
