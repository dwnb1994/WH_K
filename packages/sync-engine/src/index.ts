import type { SyncEvent, SyncEventType } from '@warehouse/types'

// ─── SQLite schema (Drizzle ORM, runs on device) ───────────────
// migrations ใช้ drizzle-kit generate

export const SYNC_QUEUE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS sync_queue (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL,
    payload       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    retry_count   INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at    TEXT NOT NULL,
    synced_at     TEXT
  );
`

// ─── Sync Engine ───────────────────────────────────────────────

export interface SyncEngineConfig {
  apiBaseUrl: string
  getAuthToken: () => Promise<string>
  onSyncComplete?: (events: SyncEvent[]) => void
  onSyncError?: (event: SyncEvent, error: Error) => void
  maxRetries?: number
  pollIntervalMs?: number
}

export interface LocalDB {
  runAsync(sql: string, params?: unknown[]): Promise<void>
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>
}

export class SyncEngine {
  private readonly maxRetries: number
  private readonly pollIntervalMs: number
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private isSyncing = false

  constructor(
    private readonly db: LocalDB,
    private readonly config: SyncEngineConfig,
  ) {
    this.maxRetries = config.maxRetries ?? 3
    this.pollIntervalMs = config.pollIntervalMs ?? 30_000
  }

  // เพิ่ม event เข้า local queue (เรียกขณะออฟไลน์)
  async enqueue(type: SyncEventType, payload: unknown): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await this.db.runAsync(
      `INSERT INTO sync_queue (id, type, payload, status, created_at)
       VALUES (?, ?, ?, 'PENDING', ?)`,
      [id, type, JSON.stringify(payload), now],
    )
    return id
  }

  // ลอง flush ทุก pending event ไปยัง API
  async flush(): Promise<void> {
    if (this.isSyncing) return
    this.isSyncing = true

    try {
      const pending = await this.db.getAllAsync<{
        id: string; type: string; payload: string; retry_count: number
      }>(
        `SELECT id, type, payload, retry_count FROM sync_queue
         WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 50`,
      )

      for (const row of pending) {
        await this.processEvent(row)
      }
    } finally {
      this.isSyncing = false
    }
  }

  private async processEvent(row: {
    id: string; type: string; payload: string; retry_count: number
  }): Promise<void> {
    try {
      const token = await this.config.getAuthToken()
      const res = await fetch(`${this.config.apiBaseUrl}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: row.id, type: row.type, payload: JSON.parse(row.payload) }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      await this.db.runAsync(
        `UPDATE sync_queue SET status = 'SYNCED', synced_at = ? WHERE id = ?`,
        [new Date().toISOString(), row.id],
      )

      this.config.onSyncComplete?.([{ id: row.id } as SyncEvent])
    } catch (err) {
      const nextRetry = row.retry_count + 1
      const isDead = nextRetry >= this.maxRetries

      await this.db.runAsync(
        `UPDATE sync_queue
         SET status = ?, retry_count = ?, error_message = ?
         WHERE id = ?`,
        [isDead ? 'ERROR' : 'PENDING', nextRetry, (err as Error).message, row.id],
      )

      if (isDead) {
        this.config.onSyncError?.({ id: row.id } as SyncEvent, err as Error)
      }
    }
  }

  // เริ่ม background polling
  start(): void {
    this.flush()
    this.pollTimer = setInterval(() => this.flush(), this.pollIntervalMs)
  }

  // หยุด polling
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  // จำนวน pending events (แสดงบน sync chip)
  async pendingCount(): Promise<number> {
    const row = await this.db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM sync_queue WHERE status = 'PENDING'`,
    )
    return row?.cnt ?? 0
  }
}
