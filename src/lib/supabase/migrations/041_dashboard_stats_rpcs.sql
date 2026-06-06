-- =============================================================================
-- 041_dashboard_stats_rpcs.sql — Server-side aggregation for dashboard stats
-- =============================================================================
-- Problem: Dashboard stats endpoint fetches up to 50K rows for monthly volume
--          and 10K rows for top categories, then aggregates client-side.
--          This transfers excessive data and is slow for high-volume entities.
-- Fix:    Create SECURITY INVOKER RPCs that aggregate server-side using SUM/GROUP BY.
-- =============================================================================

-- ── Monthly Volume RPC ──────────────────────────────────────────────────────
-- Returns the total absolute volume for a set of entities in the current month
CREATE OR REPLACE FUNCTION get_monthly_volume(p_entity_ids uuid[])
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(ABS(COALESCE(base_amount, amount))),
    0
  )
  FROM transactions
  WHERE entity_id = ANY(p_entity_ids)
    AND status != 'removed'
    AND deleted_at IS NULL
    AND date >= date_trunc('month', CURRENT_DATE)::date;
$$;

-- ── Top Categories RPC ──────────────────────────────────────────────────────
-- Returns the top 10 categories by transaction count with total amounts
CREATE OR REPLACE FUNCTION get_top_categories(p_entity_ids uuid[], p_limit int DEFAULT 10)
RETURNS TABLE(code text, txn_count bigint, total_amount numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    category_ai AS code,
    COUNT(*) AS txn_count,
    ROUND(SUM(ABS(COALESCE(base_amount, amount))), 2) AS total_amount
  FROM transactions
  WHERE entity_id = ANY(p_entity_ids)
    AND status != 'removed'
    AND deleted_at IS NULL
    AND category_ai IS NOT NULL
  GROUP BY category_ai
  ORDER BY txn_count DESC
  LIMIT p_limit;
$$;
