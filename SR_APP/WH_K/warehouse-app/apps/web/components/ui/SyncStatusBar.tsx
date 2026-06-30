'use client'

import { useCallback, useState } from 'react'
import { useSyncEvents, type SyncEvent } from '@/lib/useSyncEvents'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

function formatTime(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SyncStatusBar() {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSync = useCallback((event: SyncEvent) => {
    setSyncing(false)
    setError(null)
    setLastSync(event.syncedAt)
  }, [])

  useSyncEvents(handleSync)

  const triggerManual = async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/trcloud/pull/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      setSyncing(false)
      setError((err as Error).message)
    }
  }

  return (
    <div className="mb-4 flex min-h-10 flex-wrap items-center justify-end gap-3 border-b border-line pb-3 text-sm">
      {syncing && (
        <span className="flex items-center gap-2 text-out">
          <span className="h-2 w-2 rounded-full bg-out animate-pulse" />
          กำลังอัปเดต
        </span>
      )}
      {!syncing && lastSync && (
        <span className="text-muted">อัปเดต {formatTime(lastSync)}</span>
      )}
      {error && <span className="text-danger">Sync error: {error}</span>}
      <button
        type="button"
        onClick={triggerManual}
        disabled={syncing}
        className="rounded-md border border-line bg-white px-3 py-1.5 font-medium text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
      >
        Refresh GCS
      </button>
    </div>
  )
}
