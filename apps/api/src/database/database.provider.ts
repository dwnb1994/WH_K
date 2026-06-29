import { Provider, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Pool } from 'pg'

export const PG_POOL = 'PG_POOL'
export const InjectPool = () => Inject(PG_POOL)

export const DatabaseProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Pool => {
    const connectionString = config.get<string>('DATABASE_URL')
    if (!connectionString) {
      console.warn('[database] DATABASE_URL not set — DB operations will fail')
    }

    const useSsl = config.get<string>('DATABASE_SSL') === 'true'
    return new Pool({
      connectionString,
      max: Number(config.get('DB_POOL_MAX') ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    })
  },
}
