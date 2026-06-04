-- ============================================
-- Migration 037: Performance Indexes & Schema Additions (Round 5)
-- ============================================

-- F29: Partial index for non-deleted transactions (most common query pattern)
-- Nearly every query filters by entity_id WHERE deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_transactions_entity_not_deleted
  ON transactions (entity_id)
  WHERE deleted_at IS NULL;

-- F30: Composite index for dashboard top-categories aggregation
-- Dashboard fetches category_ai + amount grouped by entity_id
CREATE INDEX IF NOT EXISTS idx_transactions_entity_category
  ON transactions (entity_id, category_ai)
  WHERE category_ai IS NOT NULL AND deleted_at IS NULL;

-- F34 (supplementary): Index for suspense-timeout cron
-- Cron queries status='human_review' with updated_at range scan
CREATE INDEX IF NOT EXISTS idx_transactions_status_updated
  ON transactions (status, updated_at)
  WHERE status = 'human_review';

-- F37: Add sync tracking columns to journal_entries
-- Used by ledger sync engine to track sync status and errors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'sync_status'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN sync_status text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'sync_error'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN sync_error text;
  END IF;
END
$$;

-- F3 (supplementary): Add ledger_sync_id column to transactions
-- Used as idempotency key for ledger auto-push to prevent duplicate entries in QBO/Xero
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'ledger_sync_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN ledger_sync_id text;
  END IF;
END
$$;

-- F23 (supplementary): Add refresh_failures counter to ledger_connections
-- Used to prevent aggressive deactivation on transient errors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_connections' AND column_name = 'refresh_failures'
  ) THEN
    ALTER TABLE ledger_connections ADD COLUMN refresh_failures integer DEFAULT 0;
  END IF;
END
$$;
