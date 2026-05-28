-- =============================================================================
-- 002_period_locking.sql — Accounting period locking + mutation prevention
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Accounting periods table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounting_periods (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period     varchar(7)  NOT NULL, -- e.g. '2025-01'
  is_locked  boolean     DEFAULT false,
  locked_at  timestamptz,
  locked_by  uuid        REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),

  UNIQUE (entity_id, period)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_entity ON accounting_periods(entity_id);

-- ---------------------------------------------------------------------------
-- RLS for accounting_periods
-- ---------------------------------------------------------------------------

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounting_periods_select" ON accounting_periods;
CREATE POLICY "accounting_periods_select" ON accounting_periods
  FOR SELECT USING (entity_id IN (SELECT auth_user_entity_ids()));

-- Restrict lock/unlock to owner/admin roles
DROP POLICY IF EXISTS "accounting_periods_all" ON accounting_periods;
DROP POLICY IF EXISTS "accounting_periods_modify" ON accounting_periods;
CREATE POLICY "accounting_periods_modify" ON accounting_periods
  FOR ALL USING (
    entity_id IN (SELECT auth_user_entity_ids())
    AND (auth_user_has_role('owner') OR auth_user_has_role('admin'))
  );

-- ---------------------------------------------------------------------------
-- Trigger: prevent mutation on locked periods for journal_entries
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_locked_period_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_period varchar(7);
  v_locked boolean;
BEGIN
  -- Get the period from the entry date
  IF TG_OP = 'DELETE' THEN
    v_period := to_char(OLD.entry_date, 'YYYY-MM');
  ELSE
    v_period := to_char(NEW.entry_date, 'YYYY-MM');
  END IF;

  -- Check if period is locked
  SELECT is_locked INTO v_locked
  FROM accounting_periods
  WHERE entity_id = COALESCE(NEW.entity_id, OLD.entity_id)
    AND period = v_period;

  IF v_locked IS TRUE THEN
    -- PRD §6: Allow adjusting journal entries on locked periods
    -- Corrections can only be executed by passing a balancing adjusting entry
    IF TG_OP = 'INSERT' AND NEW.is_adjustment IS TRUE THEN
      -- Adjusting entries are allowed on locked periods
      NULL;
    ELSE
      RAISE EXCEPTION 'Cannot modify journal entries in locked period %', v_period;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_period_je ON journal_entries;
CREATE TRIGGER trg_prevent_locked_period_je
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_period_mutation();

-- ---------------------------------------------------------------------------
-- Trigger: prevent mutation on locked periods for transactions
-- (includes INSERT to prevent new imports into locked periods)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_locked_period_txn()
RETURNS TRIGGER AS $$
DECLARE
  v_period varchar(7);
  v_locked boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_period := to_char(OLD.date, 'YYYY-MM');
  ELSE
    v_period := to_char(NEW.date, 'YYYY-MM');
  END IF;

  SELECT is_locked INTO v_locked
  FROM accounting_periods
  WHERE entity_id = COALESCE(NEW.entity_id, OLD.entity_id)
    AND period = v_period;

  IF v_locked IS TRUE THEN
    RAISE EXCEPTION 'Cannot modify transactions in locked period %', v_period;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_period_txn ON transactions;
CREATE TRIGGER trg_prevent_locked_period_txn
  BEFORE INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_period_txn();
