-- =============================================================================
-- 006_double_entry_invariant.sql — Enforce balanced journal entries
-- =============================================================================
-- Deferred constraint trigger: ensures sum(debits) = sum(credits)
-- per journal_entry_id after all lines are inserted in a transaction.
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
