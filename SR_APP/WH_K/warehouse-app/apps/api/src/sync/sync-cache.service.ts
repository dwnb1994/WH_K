import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { TrCloudDocKind } from '../trcloud/trcloud-docs.service'

const STALE_MINUTES: Record<TrCloudDocKind, number> = {
  gr: 15,
  mr: 15,
  inc: 15,
  po: 30,
}

const ALL_DOC_TYPES: TrCloudDocKind[] = ['gr', 'mr', 'inc', 'po']

export interface DocCacheState {
  kind: TrCloudDocKind
  lastSyncedAt: Date | null
  lastRunId: string | null
  recordCount: number
  staleMinutes: number
  isStale: boolean
  ageMinutes: number | null
}

@Injectable()
export class SyncCacheService implements OnModuleInit {
  private readonly logger = new Logger(SyncCacheService.name)
  private readonly state = new Map<TrCloudDocKind, {
    syncedAt: Date | null
    runId: string | null
    count: number
  }>()

  constructor(private readonly db: DatabaseService) {
    for (const kind of ALL_DOC_TYPES) {
      this.state.set(kind, { syncedAt: null, runId: null, count: 0 })
    }
  }

  async onModuleInit() {
    await this.loadFromDb()
  }

  private async loadFromDb() {
    try {
      const rows = await this.db.query<{
        doc_type: string
        last_synced_at: Date | null
        last_run_id: string | null
        record_count: number
      }>(`SELECT doc_type, last_synced_at, last_run_id, record_count FROM trcloud_sync_state`)

      for (const row of rows) {
        if (!ALL_DOC_TYPES.includes(row.doc_type as TrCloudDocKind)) continue
        this.state.set(row.doc_type as TrCloudDocKind, {
          syncedAt: row.last_synced_at,
          runId: row.last_run_id,
          count: Number(row.record_count ?? 0),
        })
      }
    } catch (err) {
      this.logger.warn(`Sync state unavailable, using in-memory defaults: ${(err as Error).message}`)
    }
  }

  getState(kind: TrCloudDocKind): DocCacheState {
    const s = this.state.get(kind)
    const syncedAt = s?.syncedAt ?? null
    const threshold = STALE_MINUTES[kind]
    const ageMs = syncedAt ? Date.now() - syncedAt.getTime() : null
    const ageMinutes = ageMs !== null ? Math.floor(ageMs / 60000) : null
    const isStale = ageMinutes === null || ageMinutes >= threshold

    return {
      kind,
      lastSyncedAt: syncedAt,
      lastRunId: s?.runId ?? null,
      recordCount: s?.count ?? 0,
      staleMinutes: threshold,
      isStale,
      ageMinutes,
    }
  }

  getAllStates(): DocCacheState[] {
    return ALL_DOC_TYPES.map(kind => this.getState(kind))
  }

  async markSynced(kind: TrCloudDocKind, runId: string, count: number) {
    const now = new Date()
    this.state.set(kind, { syncedAt: now, runId, count })

    try {
      await this.db.query(
        `INSERT INTO trcloud_sync_state (doc_type, last_synced_at, last_run_id, record_count, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (doc_type)
         DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at,
                       last_run_id = EXCLUDED.last_run_id,
                       record_count = EXCLUDED.record_count,
                       updated_at = NOW()`,
        [kind, now, runId, count],
      )
    } catch (err) {
      this.logger.warn(`Cannot persist sync state for ${kind}: ${(err as Error).message}`)
    }
  }
}
