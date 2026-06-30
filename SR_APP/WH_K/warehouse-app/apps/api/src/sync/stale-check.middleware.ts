import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { TrCloudDocKind } from '../trcloud/trcloud-docs.service'
import { TrcloudPullService } from '../trcloud/trcloud-pull.service'
import { SyncCacheService } from './sync-cache.service'

const PATH_TO_DOC: Array<{ prefix: string; kind: TrCloudDocKind }> = [
  { prefix: '/api/v1/warehouse/gr', kind: 'gr' },
  { prefix: '/api/v1/warehouse/mr', kind: 'mr' },
  { prefix: '/api/v1/warehouse/inc', kind: 'inc' },
  { prefix: '/api/v1/warehouse/po', kind: 'po' },
  { prefix: '/warehouse/gr', kind: 'gr' },
  { prefix: '/warehouse/mr', kind: 'mr' },
  { prefix: '/warehouse/inc', kind: 'inc' },
  { prefix: '/warehouse/po', kind: 'po' },
]

@Injectable()
export class StaleCheckMiddleware implements NestMiddleware {
  constructor(
    private readonly cache: SyncCacheService,
    private readonly pull: TrcloudPullService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const match = PATH_TO_DOC.find(item => req.path.startsWith(item.prefix))
    if (match) {
      const state = this.cache.getState(match.kind)
      if (state.isStale && !this.pull.isRunning()) {
        void this.pull.triggerDelta([match.kind]).catch(() => undefined)
      }
      res.setHeader('X-Cache-Stale', state.isStale ? '1' : '0')
      res.setHeader('X-Cache-Age-Minutes', String(state.ageMinutes ?? -1))
    }

    next()
  }
}
