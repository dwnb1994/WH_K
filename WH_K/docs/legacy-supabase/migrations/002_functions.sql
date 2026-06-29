-- ================================================================
-- MWM — Supabase DB Functions & RPC
-- ================================================================

-- ─── เพิ่ม/ลดสต็อก (atomic) ────────────────────────────────────

create or replace function add_stock(
  p_item_id      uuid,
  p_warehouse_id uuid,
  p_qty          numeric,
  p_bin          text default 'DEFAULT'
) returns void language plpgsql security definer as $$
begin
  insert into stock_positions (item_id, warehouse_id, bin_code, on_hand)
  values (p_item_id, p_warehouse_id, p_bin, p_qty)
  on conflict (item_id, warehouse_id, bin_code)
  do update set on_hand = stock_positions.on_hand + excluded.on_hand,
                updated_at = now();
end;
$$;

create or replace function deduct_stock(
  p_item_id      uuid,
  p_warehouse_id uuid,
  p_qty          numeric
) returns void language plpgsql security definer as $$
begin
  update stock_positions
  set on_hand  = on_hand  - p_qty,
      reserved = greatest(0, reserved - p_qty),
      updated_at = now()
  where item_id = p_item_id and warehouse_id = p_warehouse_id;

  if not found then
    raise exception 'Stock position not found for item % warehouse %', p_item_id, p_warehouse_id;
  end if;
end;
$$;

create or replace function increment_reserved(
  p_item_id      uuid,
  p_warehouse_id uuid,
  p_qty          numeric
) returns void language plpgsql security definer as $$
begin
  update stock_positions
  set reserved   = reserved + p_qty,
      updated_at = now()
  where item_id = p_item_id and warehouse_id = p_warehouse_id;
end;
$$;

-- ─── Dashboard Aggregates ────────────────────────────────────────

create or replace function get_machine_abc_this_month()
returns table (
  machine_code text,
  machine_name text,
  total_cost   numeric,
  percentage   numeric
) language sql security definer as $$
  with totals as (
    select
      wo.machine                             as machine_code,
      wo.machine                             as machine_name,
      sum(wl.qty * wl.cost_snapshot_unit)    as total_cost
    from withdraw_transactions wt
    join work_orders wo on wo.id = wt.wo_id
    join withdraw_lines wl on wl.transaction_id = wt.id
    where wt.handshake_status = 'COMPLETE'
      and date_trunc('month', wt.confirmed_at) = date_trunc('month', now())
      and wo.machine is not null
    group by wo.machine
  ),
  grand as (select sum(total_cost) as grand_total from totals)
  select
    t.machine_code,
    t.machine_name,
    t.total_cost,
    round(t.total_cost * 100.0 / nullif(g.grand_total, 0), 1) as percentage
  from totals t, grand g
  order by t.total_cost desc
  limit 10;
$$;

create or replace function get_project_cost_breakdown_this_month()
returns table (
  project_name   text,
  cost_center_id text,
  total_cost     numeric,
  percentage     numeric
) language sql security definer as $$
  with totals as (
    select
      wo.project                            as project_name,
      wo.id::text                           as cost_center_id,
      sum(wl.qty * wl.cost_snapshot_unit)   as total_cost
    from withdraw_transactions wt
    join work_orders wo on wo.id = wt.wo_id
    join withdraw_lines wl on wl.transaction_id = wt.id
    where wt.handshake_status = 'COMPLETE'
      and date_trunc('month', wt.confirmed_at) = date_trunc('month', now())
    group by wo.project, wo.id
  ),
  grand as (select sum(total_cost) as grand_total from totals)
  select
    t.project_name,
    t.cost_center_id,
    t.total_cost,
    round(t.total_cost * 100.0 / nullif(g.grand_total, 0), 1) as percentage
  from totals t, grand g
  order by t.total_cost desc;
$$;

-- ─── pg_cron: ตรวจจับ One-sided Handshake ทุกชั่วโมง ─────────────

select cron.schedule(
  'flag-onesided-handshake',
  '0 * * * *',
  $$
    insert into audit_logs (action, entity_type, entity_id, user_id, details)
    select
      'SYNC_ERROR',
      'withdraw_transactions',
      id,
      '00000000-0000-0000-0000-000000000000',
      jsonb_build_object('reason', 'one_sided_handshake', 'age_hours', extract(epoch from now() - created_at)/3600)
    from withdraw_transactions
    where handshake_status = 'REQ_SIGNED'
      and created_at < now() - interval '24 hours'
      and not exists (
        select 1 from audit_logs al
        where al.entity_id = withdraw_transactions.id
          and al.details->>'reason' = 'one_sided_handshake'
      );
  $$
);
