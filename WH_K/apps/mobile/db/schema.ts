import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// ─── Local SQLite schema (Expo device) ─────────────────────────

export const syncQueue = sqliteTable('sync_queue', {
  id:           text('id').primaryKey(),
  type:         text('type').notNull(),
  payload:      text('payload').notNull(),         // JSON string
  status:       text('status').notNull().default('PENDING'),
  retryCount:   integer('retry_count').notNull().default(0),
  errorMessage: text('error_message'),
  createdAt:    text('created_at').notNull(),
  syncedAt:     text('synced_at'),
})

export const localStock = sqliteTable('local_stock', {
  id:          text('id').primaryKey(),
  itemId:      text('item_id').notNull(),
  sku:         text('sku').notNull(),
  name:        text('name').notNull(),
  unit:        text('unit').notNull(),
  warehouseId: text('warehouse_id').notNull(),
  whCode:      text('wh_code').notNull(),
  binCode:     text('bin_code').notNull().default('DEFAULT'),
  onHand:      real('on_hand').notNull().default(0),
  unitCost:    real('unit_cost').notNull().default(0),
  updatedAt:   text('updated_at').notNull(),
})

export const localWorkOrders = sqliteTable('local_work_orders', {
  id:         text('id').primaryKey(),
  woNumber:   text('wo_number').notNull(),
  project:    text('project').notNull(),
  department: text('department').notNull(),
  machine:    text('machine'),
  activity:   text('activity').notNull(),
  status:     text('status').notNull().default('OPEN'),
  syncedAt:   text('synced_at').notNull(),
})

export const pendingWithdraws = sqliteTable('pending_withdraws', {
  id:        text('id').primaryKey(),
  offlineId: text('offline_id').notNull().unique(),
  woId:      text('wo_id').notNull(),
  payload:   text('payload').notNull(),          // JSON string
  status:    text('status').notNull().default('PENDING'),
  createdAt: text('created_at').notNull(),
})
