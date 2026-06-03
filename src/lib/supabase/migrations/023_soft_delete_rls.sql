-- Migration 023: Enforce soft-delete visibility via RLS
-- Gap G13: Soft-deleted transactions (deleted_at IS NOT NULL) are still
-- visible in queries because no RLS policy filters them out.
--
-- APPROACH: Instead of adding .is('deleted_at', null) to every query
-- in the application (55+ locations), we add an RLS policy at the
-- database level that automatically excludes deleted rows for
-- non-admin queries. This is the defense-in-depth approach.
--
-- The service_role key (used by admin client) bypasses RLS entirely,
-- so admin endpoints can still see deleted rows when needed.

-- Drop existing SELECT policy on transactions to replace it
DROP POLICY IF EXISTS "Users can view own entity transactions" ON transactions;

-- Recreate SELECT policy with deleted_at filter
CREATE POLICY "Users can view own entity transactions"
  ON transactions
  FOR SELECT
  USING (
    entity_id IN (SELECT public.auth_user_entity_ids())
    AND deleted_at IS NULL
  );

-- Add a separate policy for admin/recovery access to deleted rows
-- (Only accessible via service_role which bypasses RLS anyway,
--  but documented here for clarity)

-- Add index on deleted_at for efficient filtering
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at
  ON transactions (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Also add soft-delete filter to the INSERT/UPDATE policies
-- to prevent updating already-deleted rows
DROP POLICY IF EXISTS "Users can update own entity transactions" ON transactions;
CREATE POLICY "Users can update own entity transactions"
  ON transactions
  FOR UPDATE
  USING (
    entity_id IN (SELECT public.auth_user_entity_ids())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    entity_id IN (SELECT public.auth_user_entity_ids())
  );
