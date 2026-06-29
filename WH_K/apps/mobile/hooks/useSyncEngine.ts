import { useEffect, useState, useCallback } from 'react'
import * as SQLite from 'expo-sqlite'
import { SyncEngine } from '@warehouse/sync-engine'
import { syncApi } from '@warehouse/api-client'
import * as SecureStore from 'expo-secure-store'
import type { SyncEventType } from '@warehouse/types'

let _engine: SyncEngine | null = null

function getDb(): SQLite.SQLiteDatabase {
  return SQLite.openDatabaseSync('mwm.db')
}

function getEngine(): SyncEngine {
  if (_engine) return _engine

  const db = getDb()
  _engine = new SyncEngine(
    {
      runAsync: (sql, params) => db.runAsync(sql, params as any),
      getAllAsync: (sql, params) => db.getAllAsync(sql, params as any),
      getFirstAsync: (sql, params) => db.getFirstAsync(sql, params as any),
    },
    {
      apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
      getAuthToken: () => SecureStore.getItemAsync('auth_token').then(t => t ?? ''),
      onSyncComplete: events =>
        console.log(`[Sync] ${events.length} events synced`),
      onSyncError: (event, err) =>
        console.error(`[Sync] Dead-letter: ${event.id} — ${err.message}`),
    },
  )
  return _engine
}

export function useSyncEngine() {
  const [pendingCount, setPendingCount] = useState(0)

  const refreshCount = useCallback(async () => {
    const count = await getEngine().pendingCount()
    setPendingCount(count)
  }, [])

  useEffect(() => {
    const engine = getEngine()
    engine.start()
    refreshCount()

    const timer = setInterval(refreshCount, 15_000)
    return () => {
      clearInterval(timer)
      engine.stop()
    }
  }, [refreshCount])

  const enqueue = useCallback(async (type: SyncEventType, payload: unknown) => {
    const id = await getEngine().enqueue(type, payload)
    await refreshCount()

    // ลอง flush ทันที (อาจมีเน็ตอยู่)
    getEngine().flush().then(refreshCount)

    return id
  }, [refreshCount])

  return { enqueue, pendingCount, refresh: refreshCount }
}
