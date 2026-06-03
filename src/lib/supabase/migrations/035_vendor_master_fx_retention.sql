-- =============================================================================
-- 035: Vendor Master Table — IRS 1099/W-9 Compliance (F4)
-- =============================================================================
-- Creates the vendor master table with:
--   - Normalized name for deduplication
--   - W-9 collection status tracking
--   - Vendor type for 1099 eligibility determination
--   - YTD payment accumulator for 1099-NEC threshold monitoring ($600)
--   - Tax ID storage (encrypted column placeholder)
--   - Entity-scoped RLS
-- =============================================================================

-- Vendor master table
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  
  -- Tax compliance fields
  tax_id_encrypted text,
  vendor_type text DEFAULT 'unknown'
    CHECK (vendor_type IN ('individual', 'llc', 's_corp', 'c_corp', 'partnership', 'nonprofit', 'government', 'unknown')),
  w9_status text DEFAULT 'not_collected'
    CHECK (w9_status IN ('not_collected', 'requested', 'received', 'verified', 'expired')),
  w9_received_at timestamptz,
  
  -- 1099 tracking
  is_1099_eligible boolean GENERATED ALWAYS AS (
    vendor_type NOT IN ('c_corp', 's_corp', 'government', 'nonprofit')
  ) STORED,
  ytd_payments numeric(15, 2) NOT NULL DEFAULT 0,
  ytd_payment_count integer NOT NULL DEFAULT 0,
  last_payment_date date,
  
  -- Contact / metadata
  email text,
  phone text,
  address_line1 text,
  address_city text,
  address_state text,
  address_zip text,
  address_country text DEFAULT 'US',
  notes text,
  
  -- Status
  is_active boolean NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate vendors per entity
  UNIQUE(entity_id, normalized_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vendors_entity ON vendors(entity_id);
CREATE INDEX IF NOT EXISTS idx_vendors_normalized ON vendors(entity_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_vendors_w9_status ON vendors(entity_id, w9_status)
  WHERE w9_status != 'verified';
CREATE INDEX IF NOT EXISTS idx_vendors_1099_eligible ON vendors(entity_id)
  WHERE is_1099_eligible = true AND ytd_payments >= 600;

-- ─── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

-- Read: entity members can view vendors
CREATE POLICY vendors_read ON vendors
  FOR SELECT USING (entity_id IN (SELECT public.auth_user_entity_ids()));

-- Insert: entity members can create vendors
CREATE POLICY vendors_insert ON vendors
  FOR INSERT WITH CHECK (entity_id IN (SELECT public.auth_user_entity_ids()));

-- Update: entity members can update vendors
CREATE POLICY vendors_update ON vendors
  FOR UPDATE USING (entity_id IN (SELECT public.auth_user_entity_ids()));

-- Delete: entity members can delete vendors (soft-delete preferred via is_active)
CREATE POLICY vendors_delete ON vendors
  FOR DELETE USING (entity_id IN (SELECT public.auth_user_entity_ids()));

-- ─── Vendor-Transaction Link ────────────────────────────────────────────────────

-- Add vendor_id FK to transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'vendor_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN vendor_id uuid REFERENCES vendors(id);
    CREATE INDEX IF NOT EXISTS idx_transactions_vendor ON transactions(vendor_id)
      WHERE vendor_id IS NOT NULL;
  END IF;
END $$;

-- ─── FX Rate Tracking (F8) ─────────────────────────────────────────────────────

-- Add exchange rate and base amount columns to transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'exchange_rate'
  ) THEN
    ALTER TABLE transactions ADD COLUMN exchange_rate numeric(12, 6);
    ALTER TABLE transactions ADD COLUMN base_amount numeric(15, 2);
    COMMENT ON COLUMN transactions.exchange_rate
      IS 'Spot exchange rate at transaction date (foreign_currency / base_currency). NULL if same currency.';
    COMMENT ON COLUMN transactions.base_amount
      IS 'Transaction amount in entity base currency. NULL if same currency.';
  END IF;
END $$;

-- ─── Document Retention Policy (F12) ────────────────────────────────────────────

-- Add retention policy to entity_settings conceptually, plus soft-delete guard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'retention_lock_until'
  ) THEN
    ALTER TABLE transactions ADD COLUMN retention_lock_until date;
    COMMENT ON COLUMN transactions.retention_lock_until
      IS 'IRS 7-year retention: this date must pass before hard-deletion is permitted.';
  END IF;
END $$;

-- Trigger to prevent deletion of retention-locked records
CREATE OR REPLACE FUNCTION trg_check_retention_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.retention_lock_until IS NOT NULL AND OLD.retention_lock_until > CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot delete: record is under retention lock until %', OLD.retention_lock_until;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_retention ON transactions;
CREATE TRIGGER trg_transactions_retention
  BEFORE DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION trg_check_retention_lock();
