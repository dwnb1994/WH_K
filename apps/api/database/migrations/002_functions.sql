-- MWM Warehouse — PostgreSQL functions (Cloud SQL compatible)

CREATE OR REPLACE FUNCTION add_stock(
  p_item_id      UUID,
  p_warehouse_id UUID,
  p_qty          NUMERIC,
  p_bin          TEXT DEFAULT 'DEFAULT'
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stock_positions (item_id, warehouse_id, bin_code, on_hand)
  VALUES (p_item_id, p_warehouse_id, p_bin, p_qty)
  ON CONFLICT (item_id, warehouse_id, bin_code)
  DO UPDATE SET on_hand = stock_positions.on_hand + EXCLUDED.on_hand,
                updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION deduct_stock(
  p_item_id      UUID,
  p_warehouse_id UUID,
  p_qty          NUMERIC
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE stock_positions
  SET on_hand  = on_hand  - p_qty,
      reserved = GREATEST(0, reserved - p_qty),
      updated_at = NOW()
  WHERE item_id = p_item_id AND warehouse_id = p_warehouse_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock position not found for item % warehouse %', p_item_id, p_warehouse_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION increment_reserved(
  p_item_id      UUID,
  p_warehouse_id UUID,
  p_qty          NUMERIC
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE stock_positions
  SET reserved   = reserved + p_qty,
      updated_at = NOW()
  WHERE item_id = p_item_id AND warehouse_id = p_warehouse_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_machine_abc_this_month()
RETURNS TABLE (
  machine_code TEXT,
  machine_name TEXT,
  total_cost   NUMERIC,
  percentage   NUMERIC
) LANGUAGE SQL AS $$
  WITH totals AS (
    SELECT
      wo.machine                             AS machine_code,
      wo.machine                             AS machine_name,
      SUM(wl.qty * wl.cost_snapshot_unit)    AS total_cost
    FROM withdraw_transactions wt
    JOIN work_orders wo ON wo.id = wt.wo_id
    JOIN withdraw_lines wl ON wl.transaction_id = wt.id
    WHERE wt.handshake_status = 'COMPLETE'
      AND DATE_TRUNC('month', wt.confirmed_at) = DATE_TRUNC('month', NOW())
      AND wo.machine IS NOT NULL
    GROUP BY wo.machine
  ),
  grand AS (SELECT SUM(total_cost) AS grand_total FROM totals)
  SELECT
    t.machine_code,
    t.machine_name,
    t.total_cost,
    ROUND(t.total_cost * 100.0 / NULLIF(g.grand_total, 0), 1) AS percentage
  FROM totals t, grand g
  ORDER BY t.total_cost DESC
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION get_project_cost_breakdown_this_month()
RETURNS TABLE (
  project_name   TEXT,
  cost_center_id TEXT,
  total_cost     NUMERIC,
  percentage     NUMERIC
) LANGUAGE SQL AS $$
  WITH totals AS (
    SELECT
      wo.project                            AS project_name,
      wo.id::TEXT                           AS cost_center_id,
      SUM(wl.qty * wl.cost_snapshot_unit)   AS total_cost
    FROM withdraw_transactions wt
    JOIN work_orders wo ON wo.id = wt.wo_id
    JOIN withdraw_lines wl ON wl.transaction_id = wt.id
    WHERE wt.handshake_status = 'COMPLETE'
      AND DATE_TRUNC('month', wt.confirmed_at) = DATE_TRUNC('month', NOW())
    GROUP BY wo.project, wo.id
  ),
  grand AS (SELECT SUM(total_cost) AS grand_total FROM totals)
  SELECT
    t.project_name,
    t.cost_center_id,
    t.total_cost,
    ROUND(t.total_cost * 100.0 / NULLIF(g.grand_total, 0), 1) AS percentage
  FROM totals t, grand g
  ORDER BY t.total_cost DESC;
$$;
