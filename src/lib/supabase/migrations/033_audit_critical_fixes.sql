-- =============================================================================
-- 033: Critical Audit Fixes — Accounting Basis + Transaction Creator Tracking
-- =============================================================================
-- F1:  Add accounting_basis to entities (GAAP compliance)
-- F13: Add created_by to transactions (SOD prerequisite)
-- =============================================================================

-- F1: Accounting basis per entity
-- Every revenue recognition, expense timing, and period-end close decision
-- depends on whether the entity uses cash or accrual basis accounting.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entities' AND column_name = 'accounting_basis'
  ) THEN
    ALTER TABLE entities ADD COLUMN accounting_basis text NOT NULL DEFAULT 'cash'
      CHECK (accounting_basis IN ('cash', 'accrual'));
    COMMENT ON COLUMN entities.accounting_basis
      IS 'GAAP accounting basis: cash (recognize when paid) or accrual (recognize when earned/incurred)';
  END IF;
END $$;

-- F13: Transaction creator tracking (SOD prerequisite)
-- Required to enforce creator ≠ approver segregation of duties.
-- System-created transactions (Plaid ingest) use NULL (system actor).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE transactions ADD COLUMN created_by uuid REFERENCES auth.users(id);
    COMMENT ON COLUMN transactions.created_by
      IS 'User who created this transaction. NULL for system-imported (Plaid). Used for SOD enforcement.';
  END IF;
END $$;

-- Index for SOD lookups
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by)
  WHERE created_by IS NOT NULL;
