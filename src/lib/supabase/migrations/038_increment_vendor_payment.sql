-- =============================================================================
-- 038_increment_vendor_payment.sql — Atomic vendor payment accumulator
-- =============================================================================
-- Creates the increment_vendor_payment RPC called by
-- src/lib/vendors/service.ts:recordVendorPayment().
-- Previously this function was missing, causing every call to fall through to
-- a buggy manual-update fallback that overwrote YTD totals instead of
-- incrementing them.
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_vendor_payment(
  p_vendor_id uuid,
  p_amount    numeric,
  p_payment_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE vendors
  SET
    ytd_payments      = COALESCE(ytd_payments, 0) + p_amount,
    ytd_payment_count = COALESCE(ytd_payment_count, 0) + 1,
    last_payment_date = GREATEST(last_payment_date, p_payment_date),
    updated_at        = now()
  WHERE id = p_vendor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor % not found', p_vendor_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION increment_vendor_payment(uuid, numeric, date)
  IS 'Atomically increments ytd_payments and ytd_payment_count for a vendor. Used by the approval workflow to track 1099-NEC compliance thresholds.';
