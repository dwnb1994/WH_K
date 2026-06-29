import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { Pool, QueryResultRow } from 'pg'
import { InjectPool } from './database.provider'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(@InjectPool() private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(text, params)
    return result.rows
  }

  async queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T | null> {
    const rows = await this.query<T>(text, params)
    return rows[0] ?? null
  }

  async queryCount(text: string, params?: unknown[]): Promise<number> {
    const row = await this.queryOne<{ count: string }>(text, params)
    return Number(row?.count ?? 0)
  }
}
