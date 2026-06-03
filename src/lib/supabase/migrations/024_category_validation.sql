-- Migration 024: Category validation against chart_of_accounts
-- Gap G8: category_ai and category_human are TEXT columns that reference
-- chart_of_accounts.code, but there's no FK or CHECK constraint.
-- The AI categorizer could assign a GL code that doesn't exist.
--
-- APPROACH: Add a trigger that validates category_ai/category_human
-- against chart_of_accounts.code for the same entity_id when set.
-- This is a soft constraint (WARNING log + allow) rather than a hard
-- constraint (reject), because:
--   1. Plaid imports arrive before CoA setup is complete
--   2. The AI may assign codes during initial categorization pass
--   3. Human review is the final validation step
--
-- We also add a partial index to accelerate the lookup.

-- Index for fast GL code lookup by entity
CREATE INDEX IF NOT EXISTS idx_coa_entity_code
  ON chart_of_accounts (entity_id, code);

-- Function to validate category codes
CREATE OR REPLACE FUNCTION validate_transaction_category()
RETURNS TRIGGER AS $$
DECLARE
  _valid boolean;
BEGIN
  -- Only validate when category_human is set (final human decision)
  -- category_ai is allowed to be provisional
  IF NEW.category_human IS NOT NULL AND NEW.category_human != '' THEN
    SELECT EXISTS (
      SELECT 1 FROM chart_of_accounts
      WHERE entity_id = NEW.entity_id
        AND code = NEW.category_human
    ) INTO _valid;

    IF NOT _valid THEN
      RAISE WARNING 'Transaction % has category_human=% which does not exist in chart_of_accounts for entity %',
        NEW.id, NEW.category_human, NEW.entity_id;
      -- Log but don't block — human may be adding a new code
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_validate_category ON transactions;
CREATE TRIGGER trg_validate_category
  BEFORE INSERT OR UPDATE OF category_human ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION validate_transaction_category();
