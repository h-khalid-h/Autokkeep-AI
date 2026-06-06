-- Migration 043: Add sync lock to bank_connections
-- Prevents concurrent syncs for the same connection (race condition between cron + webhooks)

ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS sync_in_progress boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_started_at  timestamptz;

-- Partial index to quickly find connections NOT being synced
CREATE INDEX IF NOT EXISTS idx_bank_connections_sync_lock
  ON bank_connections (id) WHERE sync_in_progress = false;

-- Safety net: auto-release stale locks older than 5 minutes
-- (handles crashes/timeouts that prevent normal unlock)
COMMENT ON COLUMN bank_connections.sync_in_progress
  IS 'Optimistic lock: set true during ingest, false on completion. Stale locks (>5min) are auto-released by callers.';
