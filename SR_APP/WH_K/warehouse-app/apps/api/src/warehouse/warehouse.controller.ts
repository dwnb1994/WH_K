import {
  Controller, Post, Get, Patch, Body, Param, Query, HttpCode,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { WarehouseService } from './warehouse.service'
import { TRCloudPoService } from '../trcloud/trcloud-po.service'
import { TRCloudDocsService } from '../trcloud/trcloud-docs.service'
import { CreateWithdrawSchema, CreateReceiveSchema } from '@warehouse/validators'
import { ZodPipe } from '../common/zod.pipe'
import type { CreateWithdrawInput, CreateReceiveInput } from '@warehouse/validators'

@ApiTags('warehouse')
@ApiBearerAuth()
@Controller('warehouse')
export class WarehouseController {
  constructor(
    private readonly svc: WarehouseService,
    private readonly poSvc: TRCloudPoService,
    private readonly docsSvc: TRCloudDocsService,
  ) {}

  // ─── Withdraw ──────────────────────────────────────────────

  @Post('withdraw')
  @ApiOperation({ summary: 'สร้างรายการเบิก (idempotent via offline_id)' })
  createWithdraw(
    @Body(new ZodPipe(CreateWithdrawSchema)) body: CreateWithdrawInput,
  ) {
    return this.svc.createWithdraw(body)
  }

  @Patch('withdraw/:id/handshake')
  @ApiOperation({ summary: 'ยืนยัน Digital Handshake — ผู้จ่ายสแกนยืนยัน' })
  confirmHandshake(
    @Param('id') id: string,
    @Body('issuerId') issuerId: string,
  ) {
    return this.svc.confirmHandshake(id, issuerId)
  }

  @Get('withdraw')
  @ApiOperation({ summary: 'รายการเบิกทั้งหมด (ประวัติ)' })
  listWithdraws(
    @Query('woId') woId?: string,
    @Query('status') status?: string,
    @Query('limit') limit = 50,
  ) {
    return this.svc.listWithdraws({ woId, status, limit: Number(limit) })
  }

  @Get('receive')
  @ApiOperation({ summary: 'รายการรับเข้าทั้งหมด' })
  listReceives(
    @Query('syncStatus') syncStatus?: string,
    @Query('limit') limit = 50,
  ) {
    return this.svc.listReceives({ syncStatus, limit: Number(limit) })
  }

  @Get('po')
  @ApiOperation({ summary: 'ใบสั่งซื้อ (PO) จาก TRCloud' })
  listPurchaseOrders(
    @Query('poRef') poRef?: string,
    @Query('vendor') vendor?: string,
    @Query('product') product?: string,
    @Query('status') status?: string,
  ) {
    return {
      meta: this.poSvc.getMeta(),
      orders: this.poSvc.listPOs({ poRef, vendor, product, status }),
    }
  }

  @Get('po/:poId/lines')
  @ApiOperation({ summary: 'รายการสินค้าใน PO' })
  getPurchaseOrderLines(@Param('poId') poId: string) {
    return this.poSvc.getPOLines(poId)
  }

  @Post('po/sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'ดึง PO ล่าสุดจาก TRCloud' })
  async syncPurchaseOrders() {
    const data = await this.poSvc.syncFromTRCloud()
    return { meta: this.poSvc.getMeta(), count: data.count }
  }

  @Get('gr')
  @ApiOperation({ summary: 'ใบรับเข้า (GR) จาก TRCloud JSON' })
  listGoodsReceipts(
    @Query('docRef') docRef?: string,
    @Query('vendor') vendor?: string,
    @Query('product') product?: string,
    @Query('status') status?: string,
    @Query('limit') limit = 100,
  ) {
    return {
      meta: this.docsSvc.getMeta('gr'),
      summary: this.docsSvc.getMeta('gr').summary,
      orders: this.docsSvc.listOrders('gr', {
        docRef, vendor, product, status, limit: Number(limit),
      }),
    }
  }

  @Get('gr/products')
  @ApiOperation({ summary: 'ดัชนี SKU จาก GR JSON' })
  getGrProductIndex() {
    return this.docsSvc.getProductIndex('gr')
  }

  @Get('gr/:receiveId/lines')
  @ApiOperation({ summary: 'รายการสินค้าใน GR' })
  getGoodsReceiptLines(@Param('receiveId') receiveId: string) {
    return this.docsSvc.getLines('gr', receiveId)
  }

  @Get('mr')
  @ApiOperation({ summary: 'ใบเบิก (MR) จาก TRCloud JSON' })
  listMaterialRequests(
    @Query('docRef') docRef?: string,
    @Query('vendor') vendor?: string,
    @Query('product') product?: string,
    @Query('status') status?: string,
    @Query('limit') limit = 100,
  ) {
    return {
      meta: this.docsSvc.getMeta('mr'),
      summary: this.docsSvc.getMeta('mr').summary,
      orders: this.docsSvc.listOrders('mr', {
        docRef, vendor, product, status, limit: Number(limit),
      }),
    }
  }

  @Get('mr/products')
  @ApiOperation({ summary: 'ดัชนี SKU จาก MR JSON' })
  getMrProductIndex() {
    return this.docsSvc.getProductIndex('mr')
  }

  @Get('mr/:mrId/lines')
  @ApiOperation({ summary: 'รายการสินค้าใน MR' })
  getMaterialRequestLines(@Param('mrId') mrId: string) {
    return this.docsSvc.getLines('mr', mrId)
  }

  @Get('inc')
  @ApiOperation({ summary: 'รับจาก PO (INC) จาก TRCloud JSON' })
  listInboundCargo(
    @Query('docRef') docRef?: string,
    @Query('vendor') vendor?: string,
    @Query('product') product?: string,
    @Query('status') status?: string,
    @Query('limit') limit = 100,
  ) {
    return {
      meta: this.docsSvc.getMeta('inc'),
      summary: this.docsSvc.getMeta('inc').summary,
      orders: this.docsSvc.listOrders('inc', {
        docRef, vendor, product, status, limit: Number(limit),
      }),
    }
  }

  @Get('inc/products')
  @ApiOperation({ summary: 'ดัชนี SKU จาก INC JSON' })
  getIncProductIndex() {
    return this.docsSvc.getProductIndex('inc')
  }

  @Get('inc/:documentId/lines')
  @ApiOperation({ summary: 'รายการสินค้าใน INC' })
  getInboundCargoLines(@Param('documentId') documentId: string) {
    return this.docsSvc.getLines('inc', documentId)
  }

  @Post('docs/reload')
  @HttpCode(200)
  @ApiOperation({ summary: 'โหลด JSON จาก disk ใหม่ (gr/mr/inc)' })
  reloadDocs(@Query('kind') kind?: 'gr' | 'mr' | 'inc') {
    const kinds = kind ? [kind] : (['gr', 'mr', 'inc'] as const)
    for (const k of kinds) this.docsSvc.reload(k)
    return { reloaded: kinds, meta: kinds.map(k => this.docsSvc.getMeta(k)) }
  }

  @Get('items')
  @ApiOperation({ summary: 'รายการสินค้า (Master data)' })
  listItems(
    @Query('search') search?: string,
    @Query('limit') limit = 100,
  ) {
    return this.svc.listItems({ search, limit: Number(limit) })
  }

  @Get('employees')
  @ApiOperation({ summary: 'รายชื่อพนักงาน / ผู้ใช้งาน' })
  listEmployees() {
    return this.svc.listEmployees()
  }

  // ─── Receive ───────────────────────────────────────────────

  @Post('receive')
  @ApiOperation({ summary: 'บันทึกรับเข้าสินค้า (GR)' })
  createReceive(
    @Body(new ZodPipe(CreateReceiveSchema)) body: CreateReceiveInput,
  ) {
    return this.svc.createReceive(body)
  }

  // ─── Stock ─────────────────────────────────────────────────

  @Get('stock')
  @ApiOperation({ summary: 'ดูสต็อกทั้งหมด แยกตามคลัง' })
  getStock(
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.getStock({ warehouseId, search })
  }

  @Get('stock/:itemId')
  @ApiOperation({ summary: 'ดูสต็อกรายพัสดุ ทุกคลัง' })
  getItemStock(@Param('itemId') itemId: string) {
    return this.svc.getItemStockAllWarehouses(itemId)
  }

  // ─── Cycle Count ───────────────────────────────────────────

  @Post('cycle-count/session')
  @ApiOperation({ summary: 'เปิดรอบตรวจนับใหม่' })
  openCycleCount(@Body() body: { warehouseIds: string[]; startedById: string }) {
    return this.svc.openCycleCount(body.warehouseIds, body.startedById)
  }

  @Patch('cycle-count/session/:id/reconcile')
  @ApiOperation({ summary: 'Reconcile & ปิดรอบตรวจนับ' })
  reconcile(
    @Param('id') sessionId: string,
    @Body() body: { lines: Array<{ itemId: string; warehouseId: string; countedQty: number; varianceReason?: string }>; reconciledById: string },
  ) {
    return this.svc.reconcileCycleCount(sessionId, body.lines, body.reconciledById)
  }
}
