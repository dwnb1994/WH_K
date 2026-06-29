import { z } from 'zod'

// ─── Withdraw ──────────────────────────────────────────────────

export const WithdrawLineSchema = z.object({
  itemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  qty: z.number().positive(),
  softBlockReason: z.enum(['CROSS_WAREHOUSE', 'URGENT_FIELD', 'IN_TRANSIT']).optional(),
})

export const CreateWithdrawSchema = z.object({
  offlineId: z.string().min(1),
  woId: z.string().uuid(),
  requesterId: z.string().uuid(),
  lines: z.array(WithdrawLineSchema).min(1),
})

export const ConfirmHandshakeSchema = z.object({
  transactionId: z.string().uuid(),
  issuerId: z.string().uuid(),
})

// ─── Receive ───────────────────────────────────────────────────

export const ReceiveLineSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
  unitCost: z.number().positive(),
  lotNumber: z.string().optional(),
  binCode: z.string().optional(),
})

export const CreateReceiveSchema = z.object({
  offlineId: z.string().min(1),
  poRef: z.string().min(1),
  supplierName: z.string().min(1),
  warehouseId: z.string().uuid(),
  receivedById: z.string().uuid(),
  lines: z.array(ReceiveLineSchema).min(1),
})

// ─── Cycle Count ───────────────────────────────────────────────

export const CycleLineCountSchema = z.object({
  itemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  countedQty: z.number().min(0),
  varianceReason: z
    .enum(['DAMAGED', 'MISCOUNT', 'LOST', 'UNRECORDED_WITHDRAW'])
    .optional(),
})

export const ReconcileSessionSchema = z.object({
  sessionId: z.string().uuid(),
  reconciledById: z.string().uuid(),
  lines: z.array(CycleLineCountSchema),
})

// ─── TRCloud Payloads ──────────────────────────────────────────

export const TRCloudGRSchema = z.object({
  doc_type: z.literal('GR'),
  po_ref: z.string(),
  warehouse_id: z.string(),
  received_by: z.string(),
  received_at: z.string().datetime({ offset: true }),
  offline_id: z.string(),
  lines: z.array(z.object({
    sku: z.string(),
    qty: z.number().positive(),
    bin: z.string(),
    unit: z.string(),
    lot: z.string().optional(),
  })),
})

export const TRCloudGISchema = z.object({
  doc_type: z.literal('GI'),
  mr_ref: z.string(),
  dest: z.string().optional(),
  kind: z.enum(['TRANSFER', 'CONSUME', 'SCRAP']),
  issued_by: z.string(),
  issued_at: z.string().datetime({ offset: true }),
  offline_id: z.string(),
  lines: z.array(z.object({
    sku: z.string(),
    qty: z.number().positive(),
    bin: z.string(),
    unit: z.string(),
  })),
})

// ─── Exported Types ────────────────────────────────────────────

export type CreateWithdrawInput  = z.infer<typeof CreateWithdrawSchema>
export type CreateReceiveInput   = z.infer<typeof CreateReceiveSchema>
export type ReconcileSessionInput = z.infer<typeof ReconcileSessionSchema>
export type TRCloudGRInput       = z.infer<typeof TRCloudGRSchema>
export type TRCloudGIInput       = z.infer<typeof TRCloudGISchema>
