-- MWM Warehouse — Cloud SQL PostgreSQL schema
-- Run: npm run db:migrate -w @warehouse/api

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE employee_role AS ENUM (
  'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'REQUESTER', 'SUPERVISOR', 'ADMIN'
);
CREATE TYPE handshake_status AS ENUM (
  'PENDING', 'REQ_SIGNED', 'ISS_SIGNED', 'COMPLETE'
);
CREATE TYPE sync_status AS ENUM (
  'PENDING', 'SYNCED', 'ERROR', 'SKIPPED'
);
CREATE TYPE soft_block_reason AS ENUM (
  'CROSS_WAREHOUSE', 'URGENT_FIELD', 'IN_TRANSIT'
);
CREATE TYPE item_condition AS ENUM ('GOOD', 'DAMAGED', 'PARTIAL');
CREATE TYPE cycle_variance_reason AS ENUM (
  'DAMAGED', 'MISCOUNT', 'LOST', 'UNRECORDED_WITHDRAW'
);
CREATE TYPE sync_event_type AS ENUM (
  'GR', 'GI', 'RETURN', 'CYCLE_RECONCILE', 'ADJUST'
);
CREATE TYPE audit_action AS ENUM (
  'WITHDRAW_CREATED', 'WITHDRAW_CONFIRMED', 'WITHDRAW_HANDSHAKE',
  'RECEIVE_CREATED', 'RETURN_CONFIRMED', 'CYCLE_COUNT_RECONCILED',
  'STOCK_ADJUSTED', 'SYNC_SUCCESS', 'SYNC_ERROR'
);

-- Master data
CREATE TABLE warehouses (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  location   TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE items (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  unit       TEXT NOT NULL,
  category   TEXT,
  min_qty    NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employees (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  role         employee_role NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id),
  firebase_uid TEXT UNIQUE,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE work_orders (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wo_number  TEXT NOT NULL UNIQUE,
  project    TEXT NOT NULL,
  department TEXT NOT NULL,
  machine    TEXT,
  activity   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stock
CREATE TABLE stock_positions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id      UUID NOT NULL REFERENCES items(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  bin_code     TEXT NOT NULL DEFAULT 'DEFAULT',
  on_hand      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, warehouse_id, bin_code)
);

CREATE VIEW stock_available AS
  SELECT *, (on_hand - reserved) AS available
  FROM stock_positions;

-- Withdraw
CREATE TABLE withdraw_transactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offline_id       TEXT NOT NULL UNIQUE,
  wo_id            UUID NOT NULL REFERENCES work_orders(id),
  requester_id     UUID NOT NULL REFERENCES employees(id),
  issuer_id        UUID REFERENCES employees(id),
  handshake_status handshake_status NOT NULL DEFAULT 'PENDING',
  sync_status      sync_status NOT NULL DEFAULT 'PENDING',
  synced_at        TIMESTAMPTZ,
  total_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  soft_blocked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at     TIMESTAMPTZ
);

CREATE TABLE withdraw_lines (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id     UUID NOT NULL REFERENCES withdraw_transactions(id) ON DELETE CASCADE,
  item_id            UUID NOT NULL REFERENCES items(id),
  warehouse_id       UUID NOT NULL REFERENCES warehouses(id),
  qty                NUMERIC(10,2) NOT NULL CHECK (qty > 0),
  soft_block_reason  soft_block_reason,
  cost_snapshot_unit NUMERIC(12,2) NOT NULL,
  cost_snapshot_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Receive
CREATE TABLE receive_transactions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offline_id     TEXT NOT NULL UNIQUE,
  po_ref         TEXT NOT NULL,
  supplier_name  TEXT NOT NULL,
  warehouse_id   UUID NOT NULL REFERENCES warehouses(id),
  received_by_id UUID NOT NULL REFERENCES employees(id),
  sync_status    sync_status NOT NULL DEFAULT 'PENDING',
  total_value    NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE receive_lines (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES receive_transactions(id) ON DELETE CASCADE,
  item_id        UUID NOT NULL REFERENCES items(id),
  qty            NUMERIC(10,2) NOT NULL CHECK (qty > 0),
  unit_cost      NUMERIC(12,2) NOT NULL,
  lot_number     TEXT,
  bin_code       TEXT
);

-- Return
CREATE TABLE return_transactions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offline_id           TEXT NOT NULL UNIQUE,
  original_withdraw_id UUID NOT NULL REFERENCES withdraw_transactions(id),
  returned_by_id       UUID NOT NULL REFERENCES employees(id),
  warehouse_id         UUID NOT NULL REFERENCES warehouses(id),
  sync_status          sync_status NOT NULL DEFAULT 'PENDING',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE return_lines (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES return_transactions(id) ON DELETE CASCADE,
  item_id        UUID NOT NULL REFERENCES items(id),
  qty            NUMERIC(10,2) NOT NULL CHECK (qty > 0),
  condition      item_condition NOT NULL
);

-- Cycle count
CREATE TABLE cycle_count_sessions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_code         TEXT NOT NULL UNIQUE,
  warehouse_ids        UUID[] NOT NULL,
  status               TEXT NOT NULL DEFAULT 'IN_PROGRESS'
                         CHECK (status IN ('IN_PROGRESS','RECONCILED','CANCELLED')),
  started_by_id        UUID NOT NULL REFERENCES employees(id),
  reconciled_by_id     UUID REFERENCES employees(id),
  total_variance_value NUMERIC(12,2),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  reconciled_at        TIMESTAMPTZ
);

CREATE TABLE cycle_count_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES cycle_count_sessions(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  system_qty      NUMERIC(10,2) NOT NULL,
  counted_qty     NUMERIC(10,2),
  variance        NUMERIC(10,2) GENERATED ALWAYS AS
                    (COALESCE(counted_qty, system_qty) - system_qty) STORED,
  variance_reason cycle_variance_reason
);

-- Audit (user_id is text — supports employee UUID or 'system')
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action      audit_action NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  user_id     TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Sync queue
CREATE TABLE sync_queue (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          sync_event_type NOT NULL,
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','SYNCED','ERROR')),
  retry_count   INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  synced_at     TIMESTAMPTZ
);

-- Migration tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_stock_item_wh   ON stock_positions       (item_id, warehouse_id);
CREATE INDEX idx_withdraw_wo     ON withdraw_transactions  (wo_id);
CREATE INDEX idx_withdraw_sync   ON withdraw_transactions  (sync_status) WHERE sync_status = 'PENDING';
CREATE INDEX idx_receive_sync    ON receive_transactions   (sync_status) WHERE sync_status = 'PENDING';
CREATE INDEX idx_sync_pend       ON sync_queue             (status, created_at) WHERE status = 'PENDING';
CREATE INDEX idx_audit_entity    ON audit_logs             (entity_type, entity_id);

-- Seed
INSERT INTO warehouses (code, name, location) VALUES
  ('A', 'คลังโรงครัว A', 'อาคารหลัก'),
  ('B', 'คลังโรงครัว B', 'อาคารรอง');
