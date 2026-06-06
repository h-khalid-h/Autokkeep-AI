-- =============================================================================
-- 050_transaction_splitting.sql — Add transaction splitting support
-- =============================================================================
-- Adds parent/child relationship columns to the transactions table so that
-- a single bank transaction can be split into multiple GL-coded children.
-- =============================================================================

-- Add parent reference for split child transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS parent_transaction_id uuid
    REFERENCES transactions(id) ON DELETE CASCADE;

-- Flag to indicate a transaction has been split
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_split boolean DEFAULT false;

-- Ordinal index within a set of splits (1-based)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS split_index smallint;

-- Partial index for efficient lookup of child transactions
CREATE INDEX IF NOT EXISTS idx_transactions_parent
  ON transactions(parent_transaction_id)
  WHERE parent_transaction_id IS NOT NULL;
