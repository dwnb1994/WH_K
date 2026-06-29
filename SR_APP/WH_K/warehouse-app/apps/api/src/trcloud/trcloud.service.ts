import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { TRCloudGRPayload, TRCloudGIPayload, TRCloudResponse } from '@warehouse/types'

@Injectable()
export class TRCloudService {
  private readonly logger = new Logger(TRCloudService.name)
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.getOrThrow('TRCLOUD_BASE_URL')
    this.apiKey  = config.getOrThrow('TRCLOUD_API_KEY')
  }

  // ─── POST Goods Receipt ─────────────────────────────────────

  async postGoodsReceipt(payload: TRCloudGRPayload): Promise<TRCloudResponse> {
    this.logger.log(`POST GR → TRCloud | offline_id=${payload.offline_id}`)
    return this.request('/api/stock/gr', payload)
  }

  // ─── POST Goods Issue ───────────────────────────────────────

  async postGoodsIssue(payload: TRCloudGIPayload): Promise<TRCloudResponse> {
    this.logger.log(`POST GI → TRCloud | offline_id=${payload.offline_id}`)
    return this.request('/api/stock/gi', payload)
  }

  // ─── GET Stock (master sync) ────────────────────────────────

  async getStockBalance(sku: string): Promise<{ sku: string; onHand: number }> {
    const res = await this.request<{ sku: string; on_hand: number }>(
      `/api/stock/balance?sku=${encodeURIComponent(sku)}`,
      null,
    )
    return { sku: res.sku, onHand: res.on_hand }
  }

  // ─── HTTP helper ────────────────────────────────────────────

  private async request<T = TRCloudResponse>(
    path: string,
    body: unknown,
  ): Promise<T> {
    const method = body === null ? 'GET' : 'POST'
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      ...(body !== null && { body: JSON.stringify(body) }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`TRCloud ${method} ${path} → ${res.status}: ${text}`)
    }

    return res.json() as Promise<T>
  }
}
