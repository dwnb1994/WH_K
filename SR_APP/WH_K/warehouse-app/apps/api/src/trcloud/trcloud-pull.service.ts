import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SyncCacheService } from '../sync/sync-cache.service'
import { SyncEventsService } from '../sync/sync-events.service'
import { TRCloudDocsService, TrCloudDocKind } from './trcloud-docs.service'

export type TriggerMode = 'gcp' | 'local' | 'mock'

const ALL_DOC_TYPES: TrCloudDocKind[] = ['gr', 'mr', 'inc', 'po']

@Injectable()
export class TrcloudPullService {
  private readonly logger = new Logger(TrcloudPullService.name)
  private readonly mode: TriggerMode
  private readonly gcpProject: string
  private readonly gcpRegion: string
  private readonly gcpJob: string
  private readonly runningJobs = new Set<string>()

  constructor(
    private readonly config: ConfigService,
    private readonly cacheState: SyncCacheService,
    private readonly events: SyncEventsService,
    private readonly docs: TRCloudDocsService,
  ) {
    this.mode = config.get('SYNC_TRIGGER_MODE', 'mock') as TriggerMode
    this.gcpProject = config.get('GCP_PROJECT_ID', 'whtdk-500801')
    this.gcpRegion = config.get('GCP_REGION', 'asia-southeast1')
    this.gcpJob = config.get('GCP_DELTA_JOB', 'python-trcloud-fetch')
  }

  async triggerDelta(docTypes: TrCloudDocKind[] = ALL_DOC_TYPES): Promise<{ runId: string }> {
    const normalized = this.normalizeDocTypes(docTypes)
    const runId = `delta_${Date.now()}`

    if (this.runningJobs.has('delta')) {
      this.logger.log('Delta job already running, skip duplicate trigger')
      return { runId: 'already-running' }
    }

    this.runningJobs.add('delta')
    this.logger.log(`Trigger delta [${normalized.join(',')}] mode=${this.mode} runId=${runId}`)

    this.runDelta(runId, normalized)
      .catch(err => this.logger.error(`Delta job ${runId} failed: ${(err as Error).message}`))
      .finally(() => this.runningJobs.delete('delta'))

    return { runId }
  }

  async pullDocAfterPush(docType: TrCloudDocKind, trcloudDocId: string): Promise<void> {
    this.logger.log(`After-push pull: ${docType} / ${trcloudDocId}`)
    await this.triggerDelta([docType])
  }

  async triggerStaleOnly(): Promise<{ triggered: TrCloudDocKind[] }> {
    const stale = ALL_DOC_TYPES.filter(kind => this.cacheState.getState(kind).isStale)
    if (!stale.length) return { triggered: [] }
    await this.triggerDelta(stale)
    return { triggered: stale }
  }

  isRunning(): boolean {
    return this.runningJobs.size > 0
  }

  private async runDelta(runId: string, docTypes: TrCloudDocKind[]): Promise<void> {
    switch (this.mode) {
      case 'gcp':
        await this.runGcpJob(docTypes)
        break
      case 'local':
        await this.runLocalProcess(runId, docTypes)
        break
      case 'mock':
      default:
        await this.runMock(runId, docTypes)
        break
    }
  }

  private async runGcpJob(docTypes: TrCloudDocKind[]): Promise<void> {
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
    const client = await auth.getClient()
    const token = await client.getAccessToken()
    const url = `https://run.googleapis.com/v2/projects/${this.gcpProject}/locations/${this.gcpRegion}/jobs/${this.gcpJob}:run`
    const args = ['--mode=delta', `--doc-types=${docTypes.map(k => k.toUpperCase()).join(',')}`]

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        overrides: {
          containerOverrides: [{ args }],
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Cloud Run trigger failed ${res.status}: ${text}`)
    }

    this.logger.log(`GCP Cloud Run Job triggered: ${this.gcpJob} ${args.join(' ')}`)
  }

  private async runLocalProcess(runId: string, docTypes: TrCloudDocKind[]): Promise<void> {
    const { spawn } = await import('child_process')
    const cwd = this.config.get('TRCLOUD_SCRIPT_ROOT', process.cwd())

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('python', [
        'Python_K/trcloud_sync_runner.py',
        '--mode',
        'delta',
        '--doc-types',
        docTypes.map(kind => kind.toUpperCase()).join(','),
      ], { cwd })

      proc.stdout.on('data', data => this.logger.log(`[python] ${data.toString().trim()}`))
      proc.stderr.on('data', data => this.logger.warn(`[python] ${data.toString().trim()}`))
      proc.on('close', code => {
        if (code === 0) resolve()
        else reject(new Error(`Python exited with code ${code}`))
      })
    })

    await this.reloadAndBroadcast(runId, docTypes)
    this.logger.log(`Local delta complete: ${runId}`)
  }

  private async runMock(runId: string, docTypes: TrCloudDocKind[]): Promise<void> {
    this.logger.log(`[MOCK] Simulating delta sync for ${docTypes.join(',')}`)
    await new Promise(resolve => setTimeout(resolve, 800))
    await this.reloadAndBroadcast(runId, docTypes)
  }

  async reloadAndBroadcast(runId: string, docTypes: TrCloudDocKind[]) {
    for (const kind of docTypes) {
      await this.docs.reload(kind)
      const meta = this.docs.getMeta(kind)
      await this.cacheState.markSynced(kind, runId, meta.count)
    }

    this.events.emit({ runId, docTypes, syncedAt: new Date().toISOString() })
  }

  private normalizeDocTypes(docTypes?: TrCloudDocKind[]): TrCloudDocKind[] {
    const requested = docTypes?.length ? docTypes : ALL_DOC_TYPES
    return Array.from(new Set(requested)).filter(kind => ALL_DOC_TYPES.includes(kind))
  }
}
