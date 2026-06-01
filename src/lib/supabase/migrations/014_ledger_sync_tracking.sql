-- ============================================
-- Migration 014: Ledger Sync Tracking
-- Track which transactions have been synced to external ledger
-- ============================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ledger_synced boolean DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ledger_synced_at timestamptz;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ledger_sync_error text;

-- Partial index: only indexes rows that still need syncing.
-- Speeds up the cron query that fetches approved-but-unsynced transactions.
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_sync
  ON transactions (entity_id, status, ledger_synced)
  WHERE status = 'approved' AND ledger_synced = false;
