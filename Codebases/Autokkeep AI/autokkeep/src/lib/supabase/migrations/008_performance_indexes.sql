-- ============================================
-- Migration 008: Performance Indexes
-- ============================================
-- Adds composite indexes for common query patterns
-- to prevent full table scans at scale.
--
-- Run in Supabase SQL Editor.
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================

-- Transactions: Most common query pattern is by entity + status
CREATE INDEX IF NOT EXISTS idx_transactions_entity_status
  ON transactions (entity_id, status);

-- Transactions: Dashboard queries filter by entity + date range
CREATE INDEX IF NOT EXISTS idx_transactions_entity_created
  ON transactions (entity_id, created_at DESC);

-- Transactions: Search by merchant name (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_transactions_entity_merchant
  ON transactions (entity_id, lower(merchant_name));

-- Transactions: Confidence-based queries (escrow, freeze review)
CREATE INDEX IF NOT EXISTS idx_transactions_entity_confidence
  ON transactions (entity_id, confidence)
  WHERE status IN ('escrow_suspense', 'human_review', 'pending');

-- Audit Log: Always queried by entity + time range
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_created
  ON audit_log (entity_id, created_at DESC);

-- Journal Entries: Queried by entity + period
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity_date
  ON journal_entries (entity_id, entry_date DESC);

-- Document Anchors: Looked up by transaction
CREATE INDEX IF NOT EXISTS idx_document_anchors_transaction
  ON document_anchors (transaction_id);

-- Bank Accounts: Looked up by connection
CREATE INDEX IF NOT EXISTS idx_bank_accounts_connection
  ON bank_accounts (connection_id);

-- Categorization Rules: Looked up by entity for rule matching
CREATE INDEX IF NOT EXISTS idx_categorization_rules_entity
  ON categorization_rules (entity_id);

-- Receipts: Looked up by transaction
CREATE INDEX IF NOT EXISTS idx_receipts_transaction
  ON receipt_requests (transaction_id);

-- Team Members: Auth queries check user_id + org_id
CREATE INDEX IF NOT EXISTS idx_team_members_user_org
  ON team_members (user_id, org_id);

-- Subscriptions: Billing queries by org
CREATE INDEX IF NOT EXISTS idx_subscriptions_org
  ON subscriptions (org_id);

-- ============================================
-- Partial indexes for hot paths
-- ============================================

-- Pending transactions needing review (dashboard count)
CREATE INDEX IF NOT EXISTS idx_transactions_pending_review
  ON transactions (entity_id, created_at DESC)
  WHERE status IN ('pending', 'human_review', 'escrow_suspense');

-- Active bank connections (sync queries)
CREATE INDEX IF NOT EXISTS idx_bank_connections_active
  ON bank_connections (entity_id)
  WHERE status = 'active';
