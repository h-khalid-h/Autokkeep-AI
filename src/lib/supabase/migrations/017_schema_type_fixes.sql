-- =============================================================================
-- 017_schema_type_fixes.sql — Align SQL schema with TypeScript types
-- =============================================================================
-- Fixes:
--   H2: Add missing transaction_status enum values
--   H3: Add missing audit_log columns (ip_address, user_agent)
--   H4: Add missing audit_action enum values
-- =============================================================================

-- ---------------------------------------------------------------------------
-- H2: transaction_status enum — add values referenced in TypeScript
-- ---------------------------------------------------------------------------
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'categorization_failed';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'syncing';

-- ---------------------------------------------------------------------------
-- H3: audit_log columns — TypeScript writes ip_address and user_agent
-- ---------------------------------------------------------------------------
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent text;

-- ---------------------------------------------------------------------------
-- H4: audit_action enum — add values referenced in TypeScript
-- ---------------------------------------------------------------------------
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'connect';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'disconnect';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'receipt_upload';
