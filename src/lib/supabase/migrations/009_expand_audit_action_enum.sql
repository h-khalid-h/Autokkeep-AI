-- ============================================================================
-- Migration 009: Expand audit_action enum
-- ============================================================================
-- Adds additional action types to support webhook event logging
-- without causing enum violations.
-- ============================================================================

-- Add 'export' action for CSV/data export tracking
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'export';

-- Add 'connect' action for integration connections (Plaid, QBO, Xero)
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'connect';

-- Add 'disconnect' action for integration disconnections
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'disconnect';

-- Add ip_address and user_agent columns to audit_log if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'ip_address') THEN
    ALTER TABLE audit_log ADD COLUMN ip_address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'user_agent') THEN
    ALTER TABLE audit_log ADD COLUMN user_agent text;
  END IF;
END $$;
