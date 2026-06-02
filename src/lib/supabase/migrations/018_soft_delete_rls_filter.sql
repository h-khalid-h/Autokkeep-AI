-- =============================================================================
-- 018: Soft-Delete RLS Filter for Transactions
-- =============================================================================
-- Problem: Transactions with deleted_at set are still visible to queries
-- because no RLS policy filters them out. This migration adds a policy
-- that hides soft-deleted transactions from non-admin users.
--
-- NOTE: Service-role clients (cron jobs, webhooks) bypass RLS and can
-- still access soft-deleted rows for audit/recovery purposes.
-- =============================================================================

-- Drop existing select policy if it exists, to recreate with filter
-- We use IF EXISTS to be idempotent
DO $$
BEGIN
  -- Check if the refined policy already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'transactions' 
    AND policyname = 'transactions_select_hide_deleted'
  ) THEN
    -- Create a new policy that filters deleted rows
    -- This is additive — existing select policies still apply (RLS is AND for restrictive, OR for permissive)
    -- Since existing policies are permissive, we add this as a RESTRICTIVE policy
    CREATE POLICY transactions_select_hide_deleted ON transactions
      AS RESTRICTIVE
      FOR SELECT
      USING (deleted_at IS NULL);
  END IF;
END $$;
