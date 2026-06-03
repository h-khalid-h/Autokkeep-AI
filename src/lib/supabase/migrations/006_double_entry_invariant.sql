-- =============================================================================
-- 006_double_entry_invariant.sql — Enforce balanced journal entries
-- =============================================================================
-- ⚠️  SUPERSEDED by 019_fix_journal_trigger_and_cleanup.sql
--     This migration has a bug: references debit_amount/credit_amount
--     instead of the actual column names debit/credit.
--     The correct trigger (trg_validate_journal_balance) was already
--     created in 000_full_init.sql using the real column names.
--     Migration 019 drops the broken trigger created here.
-- =============================================================================

CREATE OR REPLACE FUNCTION check_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debits numeric;
  total_credits numeric;
BEGIN
  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO total_debits, total_credits
  FROM journal_lines
  WHERE journal_entry_id = NEW.journal_entry_id;

  IF total_debits <> total_credits THEN
    RAISE EXCEPTION 'Journal entry % is unbalanced: debits=% credits=%',
      NEW.journal_entry_id, total_debits, total_credits;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER enforce_journal_balance
  AFTER INSERT OR UPDATE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_journal_balance();
