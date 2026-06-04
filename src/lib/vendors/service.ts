/**
 * Vendor Resolution & Management Service
 *
 * Resolves merchant names from transactions to vendor records,
 * tracks W-9 status, and monitors 1099-NEC payment thresholds.
 *
 * IRS 1099-NEC threshold: $600/year to non-corporate vendors.
 */

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ─── Constants ──────────────────────────────────────────────────────────────

/** IRS 1099-NEC reporting threshold */
export const IRS_1099_THRESHOLD = 600;

/** W-9 expiration period (3 years from received date) */
export const W9_EXPIRATION_YEARS = 3;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Vendor {
  id: string;
  entity_id: string;
  name: string;
  normalized_name: string;
  vendor_type: string;
  w9_status: string;
  w9_received_at: string | null;
  is_1099_eligible: boolean;
  ytd_payments: number;
  ytd_payment_count: number;
  last_payment_date: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VendorComplianceStatus {
  vendorId: string;
  vendorName: string;
  vendorType: string;
  w9Status: string;
  is1099Eligible: boolean;
  ytdPayments: number;
  exceeds1099Threshold: boolean;
  needs1099Filing: boolean;
  needsW9Collection: boolean;
  w9Expired: boolean;
}

// ─── Normalization ──────────────────────────────────────────────────────────

/**
 * Normalize a merchant name for deduplication.
 *
 * - Lowercases
 * - Strips store numbers, suffixes, punctuation
 * - Trims whitespace
 *
 * "STARBUCKS #12345 SEATTLE" → "starbucks"
 * "Amazon.com, Inc." → "amazon"
 */
export function normalizeMerchantName(name: string): string {
  return name
    .slice(0, 500)                           // Cap length before regex processing
    .toLowerCase()
    .replace(/[#*]\s*\d+/g, '')            // Strip store numbers (#12345)
    .replace(/\s+(inc|llc|ltd|co|corp|plc|gmbh)\.?\s*$/i, '') // Strip business suffixes
    .replace(/\.com\b/g, '')               // Strip .com
    .replace(/[.,'"!@#$%^&*()_+=\-[\]{}|\\/<>?]+/g, ' ') // Punctuation to space
    .replace(/\s+/g, ' ')                  // Collapse whitespace
    .trim();
}

// ─── Vendor Resolution ──────────────────────────────────────────────────────

/**
 * Resolve a merchant name to an existing vendor, or create a new vendor record.
 *
 * Uses normalized name matching. If no vendor exists, creates one with
 * default 'unknown' type and 'not_collected' W-9 status.
 */
export async function resolveOrCreateVendor(
  db: SupabaseQueryClient,
  entityId: string,
  merchantName: string,
): Promise<Vendor | null> {
  const normalizedName = normalizeMerchantName(merchantName);
  if (!normalizedName) return null;

  // Try to find existing vendor
  const { data: existing } = await db
    .from('vendors')
    .select('id, entity_id, name, normalized_name, vendor_type, w9_status, w9_received_at, is_1099_eligible, ytd_payments, ytd_payment_count, last_payment_date, email, is_active, created_at, updated_at')
    .eq('entity_id', entityId)
    .eq('normalized_name', normalizedName)
    .eq('is_active', true)
    .maybeSingle();

  if (existing) return existing as Vendor;

  // Create new vendor
  const { data: created, error } = await db
    .from('vendors')
    .insert({
      entity_id: entityId,
      name: merchantName,
      normalized_name: normalizedName,
      vendor_type: 'unknown',
      w9_status: 'not_collected',
    })
    .select('id, entity_id, name, normalized_name, vendor_type, w9_status, w9_received_at, is_1099_eligible, ytd_payments, ytd_payment_count, last_payment_date, email, is_active, created_at, updated_at')
    .single();

  if (error) {
    // Could be a unique constraint violation from concurrent insert — retry fetch
    if (error.code === '23505') {
      const { data: retried } = await db
        .from('vendors')
        .select('id, entity_id, name, normalized_name, vendor_type, w9_status, w9_received_at, is_1099_eligible, ytd_payments, ytd_payment_count, last_payment_date, email, is_active, created_at, updated_at')
        .eq('entity_id', entityId)
        .eq('normalized_name', normalizedName)
        .maybeSingle();
      return retried as Vendor | null;
    }
    console.error('[VendorService] Failed to create vendor:', error.message);
    return null;
  }

  return created as Vendor;
}

// ─── Payment Tracking ───────────────────────────────────────────────────────

/**
 * Record a payment to a vendor. Updates YTD accumulators.
 * Call this after a transaction is approved.
 */
export async function recordVendorPayment(
  db: SupabaseQueryClient,
  vendorId: string,
  amount: number,
  paymentDate: string,
): Promise<void> {
  const absAmount = Math.abs(amount);

  const { error: rpcError } = await db.rpc('increment_vendor_payment', {
    p_vendor_id: vendorId,
    p_amount: absAmount,
    p_payment_date: paymentDate,
  });

  if (rpcError) {
    // Fallback: manual increment (less atomic than the RPC but still correct)
    console.error('[VendorService] RPC failed, using manual update:', rpcError.message);

    // Fetch current values so we can increment rather than overwrite
    const { data: current } = await db
      .from('vendors')
      .select('ytd_payments, ytd_payment_count')
      .eq('id', vendorId)
      .single();

    const currentYtd = Number(current?.ytd_payments ?? 0);
    const currentCount = Number(current?.ytd_payment_count ?? 0);

    await db
      .from('vendors')
      .update({
        ytd_payments: currentYtd + absAmount,
        ytd_payment_count: currentCount + 1,
        last_payment_date: paymentDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId);
  }
}

// ─── 1099 Compliance ────────────────────────────────────────────────────────

/**
 * Get all vendors approaching or exceeding the 1099-NEC threshold.
 *
 * Returns vendors who are:
 * - 1099-eligible (non-corporate)
 * - Have YTD payments ≥ $600 (or approaching at ≥ $400)
 */
export async function getVendors1099Status(
  db: SupabaseQueryClient,
  entityId: string,
): Promise<VendorComplianceStatus[]> {
  const { data: vendors, error } = await db
    .from('vendors')
    .select('id, entity_id, name, normalized_name, vendor_type, w9_status, w9_received_at, is_1099_eligible, ytd_payments, ytd_payment_count, last_payment_date, email, is_active, created_at, updated_at')
    .eq('entity_id', entityId)
    .eq('is_active', true)
    .gte('ytd_payments', 400) // Include approaching threshold
    .order('ytd_payments', { ascending: false });

  if (error || !vendors) return [];

  return (vendors as Vendor[]).map((v) => {
    const w9Expired = v.w9_received_at
      ? new Date(v.w9_received_at).getTime() <
        Date.now() - W9_EXPIRATION_YEARS * 365.25 * 24 * 60 * 60 * 1000
      : false;

    return {
      vendorId: v.id,
      vendorName: v.name,
      vendorType: v.vendor_type,
      w9Status: w9Expired ? 'expired' : v.w9_status,
      is1099Eligible: v.is_1099_eligible,
      ytdPayments: v.ytd_payments,
      exceeds1099Threshold: v.ytd_payments >= IRS_1099_THRESHOLD,
      needs1099Filing:
        v.is_1099_eligible && v.ytd_payments >= IRS_1099_THRESHOLD,
      needsW9Collection:
        v.is_1099_eligible &&
        v.ytd_payments >= IRS_1099_THRESHOLD &&
        (v.w9_status === 'not_collected' || v.w9_status === 'requested' || w9Expired),
      w9Expired,
    };
  });
}

/**
 * Get W-9 collection summary for an entity.
 */
export async function getW9Summary(
  db: SupabaseQueryClient,
  entityId: string,
): Promise<{
  totalVendors: number;
  verified: number;
  pending: number;
  notCollected: number;
  expired: number;
  needsAttention: number;
}> {
  const { data: vendors } = await db
    .from('vendors')
    .select('w9_status, w9_received_at, is_1099_eligible, ytd_payments')
    .eq('entity_id', entityId)
    .eq('is_active', true);

  if (!vendors || vendors.length === 0) {
    return { totalVendors: 0, verified: 0, pending: 0, notCollected: 0, expired: 0, needsAttention: 0 };
  }

  let verified = 0, pending = 0, notCollected = 0, expired = 0, needsAttention = 0;

  for (const v of vendors as { w9_status: string; w9_received_at: string | null; is_1099_eligible: boolean; ytd_payments: number }[]) {
    const isExpired = v.w9_received_at
      ? new Date(v.w9_received_at).getTime() <
        Date.now() - W9_EXPIRATION_YEARS * 365.25 * 24 * 60 * 60 * 1000
      : false;

    if (isExpired) {
      expired++;
    } else if (v.w9_status === 'verified' || v.w9_status === 'received') {
      verified++;
    } else if (v.w9_status === 'requested') {
      pending++;
    } else {
      notCollected++;
    }

    // Needs attention: 1099-eligible, above threshold, missing W-9
    if (
      v.is_1099_eligible &&
      v.ytd_payments >= IRS_1099_THRESHOLD &&
      ((v.w9_status !== 'verified' && v.w9_status !== 'received') || isExpired)
    ) {
      needsAttention++;
    }
  }

  return {
    totalVendors: vendors.length,
    verified,
    pending,
    notCollected,
    expired,
    needsAttention,
  };
}
