-- ================================================================
-- MWM Warehouse System — Supabase PostgreSQL Schema
-- ================================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";

-- ─── Enums ──────────────────────────────────────────────────────

create type employee_role as enum (
  'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'REQUESTER', 'SUPERVISOR', 'ADMIN'
);

create type handshake_status as enum (
  'PENDING', 'REQ_SIGNED', 'ISS_SIGNED', 'COMPLETE'
);

create type sync_status as enum (
  'PENDING', 'SYNCED', 'ERROR', 'SKIPPED'
);

create type soft_block_reason as enum (
  'CROSS_WAREHOUSE', 'URGENT_FIELD', 'IN_TRANSIT'
);

create type item_condition as enum ('GOOD', 'DAMAGED', 'PARTIAL');

create type cycle_variance_reason as enum (
  'DAMAGED', 'MISCOUNT', 'LOST', 'UNRECORDED_WITHDRAW'
);

create type sync_event_type as enum (
  'GR', 'GI', 'RETURN', 'CYCLE_RECONCILE', 'ADJUST'
);

create type audit_action as enum (
  'WITHDRAW_CREATED', 'WITHDRAW_CONFIRMED', 'WITHDRAW_HANDSHAKE',
  'RECEIVE_CREATED', 'RETURN_CONFIRMED', 'CYCLE_COUNT_RECONCILED',
  'STOCK_ADJUSTED', 'SYNC_SUCCESS', 'SYNC_ERROR'
);

-- ─── Master Data ────────────────────────────────────────────────

create table warehouses (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,  -- 'A', 'B'
  name        text not null,
  location    text,
  created_at  timestamptz default now()
);

create table items (
  id          uuid primary key default uuid_generate_v4(),
  sku         text not null unique,
  name        text not null,
  unit        text not null,
  category    text,
  min_qty     numeric(10,2) not null default 0,
  image_url   text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table employees (
  id           uuid primary key default uuid_generate_v4(),
  code         text not null unique,
  name         text not null,
  role         employee_role not null,
  warehouse_id uuid references warehouses(id),
  user_id      uuid references auth.users(id),  -- Supabase Auth link
  active       boolean not null default true,
  created_at   timestamptz default now()
);

create table work_orders (
  id          uuid primary key default uuid_generate_v4(),
  wo_number   text not null unique,
  project     text not null,
  department  text not null,
  machine     text,
  activity    text not null,
  status      text not null default 'OPEN' check (status in ('OPEN','CLOSED','CANCELLED')),
  created_at  timestamptz default now()
);

-- ─── Stock ──────────────────────────────────────────────────────

create table stock_positions (
  id           uuid primary key default uuid_generate_v4(),
  item_id      uuid not null references items(id),
  warehouse_id uuid not null references warehouses(id),
  bin_code     text not null default 'DEFAULT',
  on_hand      numeric(10,2) not null default 0 check (on_hand >= 0),
  reserved     numeric(10,2) not null default 0 check (reserved >= 0),
  updated_at   timestamptz default now(),
  unique (item_id, warehouse_id, bin_code)
);

-- computed view: available = on_hand - reserved
create view stock_available as
  select *, (on_hand - reserved) as available
  from stock_positions;

-- ─── Withdraw (การเบิก) ─────────────────────────────────────────

create table withdraw_transactions (
  id                uuid primary key default uuid_generate_v4(),
  offline_id        text not null unique,  -- idempotency key from device
  wo_id             uuid not null references work_orders(id),
  requester_id      uuid not null references employees(id),
  issuer_id         uuid references employees(id),
  handshake_status  handshake_status not null default 'PENDING',
  sync_status       sync_status not null default 'PENDING',
  synced_at         timestamptz,
  total_cost        numeric(12,2) not null default 0,
  soft_blocked      boolean not null default false,
  created_at        timestamptz default now(),
  confirmed_at      timestamptz
);

create table withdraw_lines (
  id                  uuid primary key default uuid_generate_v4(),
  transaction_id      uuid not null references withdraw_transactions(id) on delete cascade,
  item_id             uuid not null references items(id),
  warehouse_id        uuid not null references warehouses(id),
  qty                 numeric(10,2) not null check (qty > 0),
  soft_block_reason   soft_block_reason,
  cost_snapshot_unit  numeric(12,2) not null,  -- ราคาทุนที่ล็อก ณ วันเบิก
  cost_snapshot_at    timestamptz not null default now()
);

-- ─── Receive (การรับเข้า) ────────────────────────────────────────

create table receive_transactions (
  id             uuid primary key default uuid_generate_v4(),
  offline_id     text not null unique,
  po_ref         text not null,
  supplier_name  text not null,
  warehouse_id   uuid not null references warehouses(id),
  received_by_id uuid not null references employees(id),
  sync_status    sync_status not null default 'PENDING',
  total_value    numeric(12,2) not null default 0,
  created_at     timestamptz default now()
);

create table receive_lines (
  id              uuid primary key default uuid_generate_v4(),
  transaction_id  uuid not null references receive_transactions(id) on delete cascade,
  item_id         uuid not null references items(id),
  qty             numeric(10,2) not null check (qty > 0),
  unit_cost       numeric(12,2) not null,
  lot_number      text,
  bin_code        text
);

-- ─── Return (การส่งคืน) ──────────────────────────────────────────

create table return_transactions (
  id                    uuid primary key default uuid_generate_v4(),
  offline_id            text not null unique,
  original_withdraw_id  uuid not null references withdraw_transactions(id),
  returned_by_id        uuid not null references employees(id),
  warehouse_id          uuid not null references warehouses(id),
  sync_status           sync_status not null default 'PENDING',
  created_at            timestamptz default now()
);

create table return_lines (
  id              uuid primary key default uuid_generate_v4(),
  transaction_id  uuid not null references return_transactions(id) on delete cascade,
  item_id         uuid not null references items(id),
  qty             numeric(10,2) not null check (qty > 0),
  condition       item_condition not null
);

-- ─── Cycle Count (ตรวจนับสต็อก) ──────────────────────────────────

create table cycle_count_sessions (
  id                     uuid primary key default uuid_generate_v4(),
  session_code           text not null unique,
  warehouse_ids          uuid[] not null,
  status                 text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS','RECONCILED','CANCELLED')),
  started_by_id          uuid not null references employees(id),
  reconciled_by_id       uuid references employees(id),
  total_variance_value   numeric(12,2),
  created_at             timestamptz default now(),
  reconciled_at          timestamptz
);

create table cycle_count_lines (
  id                uuid primary key default uuid_generate_v4(),
  session_id        uuid not null references cycle_count_sessions(id) on delete cascade,
  item_id           uuid not null references items(id),
  warehouse_id      uuid not null references warehouses(id),
  system_qty        numeric(10,2) not null,
  counted_qty       numeric(10,2),
  variance          numeric(10,2) generated always as (coalesce(counted_qty, system_qty) - system_qty) stored,
  variance_reason   cycle_variance_reason
);

-- ─── Audit Log ──────────────────────────────────────────────────

create table audit_logs (
  id           uuid primary key default uuid_generate_v4(),
  action       audit_action not null,
  entity_type  text not null,
  entity_id    uuid not null,
  user_id      uuid not null references employees(id),
  details      jsonb not null default '{}',
  created_at   timestamptz default now()
);

-- ─── Sync Queue (for NestJS processing) ─────────────────────────

create table sync_queue (
  id            uuid primary key default uuid_generate_v4(),
  type          sync_event_type not null,
  payload       jsonb not null,
  status        text not null default 'PENDING' check (status in ('PENDING','SYNCED','ERROR')),
  retry_count   int not null default 0,
  error_message text,
  created_at    timestamptz default now(),
  synced_at     timestamptz
);

-- ─── Row Level Security ──────────────────────────────────────────

alter table warehouses              enable row level security;
alter table items                   enable row level security;
alter table employees               enable row level security;
alter table stock_positions         enable row level security;
alter table withdraw_transactions   enable row level security;
alter table withdraw_lines          enable row level security;
alter table receive_transactions    enable row level security;
alter table receive_lines           enable row level security;
alter table return_transactions     enable row level security;
alter table cycle_count_sessions    enable row level security;
alter table audit_logs              enable row level security;
alter table sync_queue              enable row level security;

-- Authenticated users can read master data
create policy "employees read warehouses" on warehouses for select to authenticated using (true);
create policy "employees read items"      on items      for select to authenticated using (true);

-- Service role bypass (for NestJS backend)
create policy "service role all" on withdraw_transactions for all to service_role using (true) with check (true);
create policy "service role all" on receive_transactions  for all to service_role using (true) with check (true);
create policy "service role all" on sync_queue            for all to service_role using (true) with check (true);
create policy "service role all" on audit_logs            for all to service_role using (true) with check (true);
create policy "service role all" on stock_positions       for all to service_role using (true) with check (true);

-- ─── Realtime Publication ───────────────────────────────────────

alter publication supabase_realtime add table stock_positions;
alter publication supabase_realtime add table sync_queue;

-- ─── Indexes ────────────────────────────────────────────────────

create index idx_stock_item_wh    on stock_positions (item_id, warehouse_id);
create index idx_withdraw_wo      on withdraw_transactions (wo_id);
create index idx_withdraw_sync    on withdraw_transactions (sync_status) where sync_status = 'PENDING';
create index idx_receive_sync     on receive_transactions (sync_status)  where sync_status = 'PENDING';
create index idx_sync_queue_pend  on sync_queue (status, created_at)    where status = 'PENDING';
create index idx_audit_entity     on audit_logs (entity_type, entity_id);
create index idx_audit_user       on audit_logs (user_id);

-- ─── Seed Data ──────────────────────────────────────────────────

insert into warehouses (code, name, location) values
  ('A', 'คลังโรงครัว A', 'อาคารหลัก'),
  ('B', 'คลังโรงครัว B', 'อาคารรอง');
