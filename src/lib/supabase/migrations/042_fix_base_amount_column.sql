-- =============================================================================
-- 042_fix_base_amount_column.sql — Fix missing base_amount column
-- =============================================================================
-- Bug: Migration 035 bundles base_amount creation inside an IF NOT EXISTS
-- check for exchange_rate. Since migration 011 already created exchange_rate,
-- the entire DO block is skipped and base_amount is never created.
-- Fix: Add base_amount independently with its own IF NOT EXISTS guard.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'base_amount'
  ) THEN
    ALTER TABLE transactions ADD COLUMN base_amount numeric(15, 2);
    COMMENT ON COLUMN transactions.base_amount
      IS 'Transaction amount in entity base currency. NULL if same currency.';
  END IF;
END $$;
