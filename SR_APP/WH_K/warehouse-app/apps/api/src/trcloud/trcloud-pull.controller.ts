import { Body, Controller, Get, Logger, MessageEvent, Post, Sse } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { map, Observable } from 'rxjs'
import { SyncCacheService } from '../sync/sync-cache.service'
import { SyncEventsService } from '../sync/sync-events.service'
import { TRCloudDocsService, TrCloudDocKind } from './trcloud-docs.service'
import { TrcloudPullService } from './trcloud-pull.service'

@ApiTags('trcloud-pull')
@Controller('trcloud/pull')
export class TrcloudPullController {
  private readonly logger = new Logger(TrcloudPullController.name)

  constructor(
    private readonly pull: TrcloudPullService,
    private readonly cache: SyncCacheService,
    private readonly events: SyncEventsService,
    private readonly docs: TRCloudDocsService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Cache age and stale state by TRCloud document type' })
  status() {
    return {
      states: this.cache.getAllStates(),
      isRunning: this.pull.isRunning(),
    }
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Trigger TRCloud delta sync immediately' })
  async trigger(@Body() body: { docTypes?: TrCloudDocKind[] }) {
    const { runId } = await this.pull.triggerDelta(body?.docTypes)
    return { ok: true, runId }
  }

  @Post('pubsub')
  @ApiOperation({ summary: 'Receive GCP Pub/Sub sync-complete push event' })
  async pubsub(@Body() body: {
    message?: { data?: string; attributes?: Record<string, string> }
  }) {
    const raw = body.message?.data
      ? Buffer.from(body.message.data, 'base64').toString('utf-8')
      : '{}'
    const payload = JSON.parse(raw) as {
      run_id?: string
      runId?: string
      doc_types?: string[]
      docTypes?: string[]
    }
    const runId = payload.run_id ?? payload.runId ?? `pubsub_${Date.now()}`
    const docTypes = this.normalizeDocTypes(payload.doc_types ?? payload.docTypes)

    this.logger.log(`Pub/Sub received: runId=${runId} types=${docTypes.join(',')}`)
    for (const docType of docTypes) {
      await this.docs.reload(docType)
      const meta = this.docs.getMeta(docType)
      await this.cache.markSynced(docType, runId, meta.count)
    }

    this.events.emit({
      runId,
      docTypes,
      syncedAt: new Date().toISOString(),
    })

    return { ok: true }
  }

  @Sse('events')
  @ApiOperation({ summary: 'SSE stream for TRCloud sync completion events' })
  sseEvents(): Observable<MessageEvent> {
    return this.events.events$().pipe(
      map(event => ({
        data: event,
        type: 'sync:complete',
      }) as MessageEvent),
    )
  }

  private normalizeDocTypes(docTypes?: string[]): TrCloudDocKind[] {
    const valid: TrCloudDocKind[] = ['gr', 'mr', 'inc', 'po']
    const requested = docTypes?.length ? docTypes : valid
    return Array.from(new Set(
      requested
        .map(item => item.toLowerCase() as TrCloudDocKind)
        .filter(item => valid.includes(item)),
    ))
  }
}
