-- =============================================================================
-- Autokkeep — Audit Log Column Migration (005)
-- =============================================================================
-- Adds ip_address and user_agent columns to the audit_log table
-- for SOC 2 / SOX compliance requirements.
--
-- Safe to run multiple times (uses IF NOT EXISTS pattern via DO block).
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN ip_address TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN user_agent TEXT;
  END IF;
END $$;
