-- ============================================================
-- Migration 039: Add missing indexes for performance
-- Addresses gaps found in deep performance audit.
-- ============================================================

-- approval_thresholds — queried by entity_id + min_amount in approval.ts
CREATE INDEX IF NOT EXISTS idx_approval_thresholds_entity_amount
  ON approval_thresholds (entity_id, min_amount);

-- approval_requests — queried by transaction_id + status (approval lookup)
CREATE INDEX IF NOT EXISTS idx_approval_requests_txn_status
  ON approval_requests (transaction_id, status);

-- approval_requests — queried by entity_id + status (pending list)
CREATE INDEX IF NOT EXISTS idx_approval_requests_entity_status
  ON approval_requests (entity_id, status);

-- vendors — queried by entity_id + normalized_name (lookup/upsert)
CREATE INDEX IF NOT EXISTS idx_vendors_entity_normalized
  ON vendors (entity_id, normalized_name);

-- vendors — queried by entity_id + is_active (active vendor list)
CREATE INDEX IF NOT EXISTS idx_vendors_entity_active
  ON vendors (entity_id, is_active)
  WHERE is_active = true;

-- accounting_periods — queried by entity_id + is_locked (period lock checks)
CREATE INDEX IF NOT EXISTS idx_accounting_periods_entity_locked
  ON accounting_periods (entity_id, is_locked)
  WHERE is_locked = true;

-- receipt_ocr_queue — queried by status (cron processing)
CREATE INDEX IF NOT EXISTS idx_receipt_ocr_queue_status
  ON receipt_ocr_queue (status)
  WHERE status IN ('pending', 'failed');

-- entity_settings — queried by entity_id + key
CREATE INDEX IF NOT EXISTS idx_entity_settings_entity_key
  ON entity_settings (entity_id, key);

-- ledger_connections — queried by is_active + token_expires_at (token refresh)
CREATE INDEX IF NOT EXISTS idx_ledger_connections_active_expiry
  ON ledger_connections (is_active, token_expires_at)
  WHERE is_active = true;

-- transactions — queried by status + ledger_synced (auto-push)
CREATE INDEX IF NOT EXISTS idx_transactions_approved_unsynced
  ON transactions (status, ledger_synced)
  WHERE status = 'approved' AND ledger_synced = false;
