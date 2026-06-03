-- =============================================================================
-- 019_fix_journal_trigger_and_cleanup.sql
-- =============================================================================
-- Fixes:
--   1. Drops the broken duplicate trigger from migration 006 that references
--      non-existent columns (debit_amount/credit_amount vs actual debit/credit).
--   2. The correct trigger (trg_validate_journal_balance from 000_full_init.sql)
--      remains — it uses the real column names.
-- =============================================================================

-- Drop the broken trigger first, then the orphan function
DROP TRIGGER IF EXISTS enforce_journal_balance ON journal_lines;
DROP FUNCTION IF EXISTS check_journal_balance();
