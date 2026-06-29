import { Controller, Post, Get, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { SyncService } from './sync.service'

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly svc: SyncService) {}

  @Post()
  @ApiOperation({ summary: 'รับ offline event จากอุปกรณ์แล้ว enqueue ไปยัง TRCloud' })
  receiveEvent(@Body() body: { id: string; type: string; payload: unknown }) {
    return this.svc.processRow({ id: body.id, type: body.type as any, payload: body.payload as any, retry_count: 0 })
  }

  @Post('flush')
  @ApiOperation({ summary: 'Force flush pending sync queue (admin)' })
  flush() {
    return this.svc.flushQueue()
  }

  @Get('status')
  @ApiOperation({ summary: 'ดูสถานะ sync queue' })
  async status() {
    return this.svc.getQueueStatus()
  }
}
