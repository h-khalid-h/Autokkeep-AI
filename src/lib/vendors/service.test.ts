import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Fluent chain builder for Supabase query mocks
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  // Thenable for queries that don't use .single()
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

const mockDb = {
  from: vi.fn(),
  storage: { from: vi.fn() },
  rpc: vi.fn(),
  auth: {},
};

// ─── Import under test ──────────────────────────────────────────────────────────

import {
  normalizeMerchantName,
  IRS_1099_THRESHOLD,
  recordVendorPayment,
  resolveOrCreateVendor,
  getVendors1099Status,
  getW9Summary,
} from './service';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const db = mockDb as unknown as SupabaseQueryClient;

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('normalizeMerchantName', () => {
  it('lowercases and trims', () => {
    expect(normalizeMerchantName('  STARBUCKS  ')).toBe('starbucks');
  });

  it('strips store numbers', () => {
    expect(normalizeMerchantName('STARBUCKS #12345 SEATTLE')).toBe('starbucks seattle');
  });

  it('strips business suffixes', () => {
    expect(normalizeMerchantName('Amazon.com, Inc.')).toBe('amazon');
  });

  it('strips LLC suffix', () => {
    expect(normalizeMerchantName('Acme Services LLC')).toBe('acme services');
  });

  it('handles punctuation', () => {
    expect(normalizeMerchantName("O'Reilly Auto Parts")).toBe('o reilly auto parts');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeMerchantName('')).toBe('');
  });

  it('handles complex merchant names', () => {
    expect(normalizeMerchantName('UBER *TRIP HELP.UBER.COM')).toBe('uber trip help uber');
  });

  it('strips .com', () => {
    expect(normalizeMerchantName('AMAZON.COM')).toBe('amazon');
  });

  it('handles Unicode characters', () => {
    const result = normalizeMerchantName('Café Müller GmbH');
    // Should lowercase, strip GmbH suffix, keep accented chars
    expect(result).toBe('café müller');
  });

  it('handles very long strings (>1000 chars) with length cap', () => {
    const longName = 'A'.repeat(1200);
    const result = normalizeMerchantName(longName);
    // Should not crash, should be capped at 500 chars
    expect(result).toBe('a'.repeat(500));
    expect(result.length).toBe(500);
  });

  it('returns empty string for only punctuation', () => {
    const result = normalizeMerchantName('!@#$%^&*()');
    expect(result).toBe('');
  });

  it('handles numbers only', () => {
    const result = normalizeMerchantName('1234567890');
    expect(result).toBe('1234567890');
  });

  it('handles mixed Unicode and punctuation', () => {
    const result = normalizeMerchantName("  Ñoño's Café & Bar, LLC  ");
    // Should strip LLC, punctuation → spaces, then collapse & trim
    expect(result).toContain('ñoño');
    expect(result).toContain('café');
    expect(result).not.toContain('llc');
  });
});

describe('IRS_1099_THRESHOLD', () => {
  it('is $600', () => {
    expect(IRS_1099_THRESHOLD).toBe(600);
  });
});

// ─── recordVendorPayment ────────────────────────────────────────────────────────

describe('recordVendorPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls RPC increment_vendor_payment with correct args on success', async () => {
    mockDb.rpc.mockResolvedValue({ error: null });

    await recordVendorPayment(db, 'vendor-1', 250, '2026-01-15');

    expect(mockDb.rpc).toHaveBeenCalledWith('increment_vendor_payment', {
      p_vendor_id: 'vendor-1',
      p_amount: 250,
      p_payment_date: '2026-01-15',
    });
    // Should NOT fall back to manual read+write
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it('falls back to manual read+write when RPC returns error', async () => {
    mockDb.rpc.mockResolvedValue({ error: { message: 'function not found' } });

    const fetchChain = createChainMock({
      data: { ytd_payments: 100, ytd_payment_count: 2 },
      error: null,
    });
    const updateChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockDb.from.mockImplementation(() => {
      callCount++;
      return callCount <= 1 ? fetchChain : updateChain;
    });

    await recordVendorPayment(db, 'vendor-1', 50, '2026-02-01');

    // Verify fallback fetched current values
    expect(fetchChain.select).toHaveBeenCalledWith('ytd_payments, ytd_payment_count');
    expect(fetchChain.eq).toHaveBeenCalledWith('id', 'vendor-1');

    // Verify fallback updated with incremented values
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ytd_payments: 150,
        ytd_payment_count: 3,
        last_payment_date: '2026-02-01',
      }),
    );
  });

  it('calls RPC with zero amount (uses Math.abs → 0)', async () => {
    mockDb.rpc.mockResolvedValue({ error: null });

    await recordVendorPayment(db, 'vendor-1', 0, '2026-03-01');

    expect(mockDb.rpc).toHaveBeenCalledWith('increment_vendor_payment', {
      p_vendor_id: 'vendor-1',
      p_amount: 0,
      p_payment_date: '2026-03-01',
    });
  });

  it('handles negative amount gracefully (uses Math.abs)', async () => {
    mockDb.rpc.mockResolvedValue({ error: null });

    await recordVendorPayment(db, 'vendor-1', -75.5, '2026-04-01');

    expect(mockDb.rpc).toHaveBeenCalledWith('increment_vendor_payment', {
      p_vendor_id: 'vendor-1',
      p_amount: 75.5,
      p_payment_date: '2026-04-01',
    });
  });
});

// ─── resolveOrCreateVendor ──────────────────────────────────────────────────────

describe('resolveOrCreateVendor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const existingVendor = {
    id: 'v-1',
    entity_id: 'entity-1',
    name: 'Starbucks',
    normalized_name: 'starbucks',
    vendor_type: 'supplier',
    w9_status: 'verified',
    w9_received_at: '2025-01-01T00:00:00Z',
    is_1099_eligible: true,
    ytd_payments: 500,
    ytd_payment_count: 5,
    last_payment_date: '2026-01-15',
    email: 'vendor@starbucks.com',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  };

  it('returns existing vendor when one matches', async () => {
    const chain = createChainMock({ data: existingVendor, error: null });
    mockDb.from.mockReturnValue(chain);

    const result = await resolveOrCreateVendor(db, 'entity-1', 'STARBUCKS #999');

    expect(result).toEqual(existingVendor);
    // Should query with normalized name
    expect(chain.eq).toHaveBeenCalledWith('normalized_name', 'starbucks');
    // Should NOT insert
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('creates new vendor when none exists', async () => {
    const createdVendor = {
      ...existingVendor,
      id: 'v-new',
      name: 'New Vendor Co',
      normalized_name: 'new vendor',
      vendor_type: 'unknown',
      w9_status: 'not_collected',
    };

    // First call: .maybeSingle() returns null (no existing vendor)
    const lookupChain = createChainMock({ data: null, error: null });
    // Second call: .insert().select().single() creates and returns vendor
    const insertChain = createChainMock({ data: createdVendor, error: null });

    let callCount = 0;
    mockDb.from.mockImplementation(() => {
      callCount++;
      return callCount <= 1 ? lookupChain : insertChain;
    });

    const result = await resolveOrCreateVendor(db, 'entity-1', 'New Vendor Co');

    expect(result).toEqual(createdVendor);
    expect(insertChain.insert).toHaveBeenCalledWith({
      entity_id: 'entity-1',
      name: 'New Vendor Co',
      normalized_name: 'new vendor',
      vendor_type: 'unknown',
      w9_status: 'not_collected',
    });
  });

  it('retries on unique constraint violation (code 23505) and succeeds', async () => {
    const retriedVendor = { ...existingVendor, id: 'v-concurrent' };

    // First call: lookup returns null
    const lookupChain = createChainMock({ data: null, error: null });
    // Second call: insert fails with unique constraint
    const insertChain = createChainMock({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });
    // Third call: retry fetch succeeds
    const retryChain = createChainMock({ data: retriedVendor, error: null });

    let callCount = 0;
    mockDb.from.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) return lookupChain;
      if (callCount <= 2) return insertChain;
      return retryChain;
    });

    const result = await resolveOrCreateVendor(db, 'entity-1', 'Starbucks');

    expect(result).toEqual(retriedVendor);
  });

  it('returns null for empty/blank merchant name', async () => {
    const result = await resolveOrCreateVendor(db, 'entity-1', '');
    expect(result).toBeNull();
    expect(mockDb.from).not.toHaveBeenCalled();
  });
});

// ─── getVendors1099Status ───────────────────────────────────────────────────────

describe('getVendors1099Status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flags vendor with ytd >= $600 for 1099', async () => {
    const chain = createChainMock({
      data: [
        {
          id: 'v-1',
          entity_id: 'entity-1',
          name: 'Big Vendor',
          normalized_name: 'big vendor',
          vendor_type: 'contractor',
          w9_status: 'verified',
          w9_received_at: '2025-06-01T00:00:00Z',
          is_1099_eligible: true,
          ytd_payments: 750,
          ytd_payment_count: 10,
          last_payment_date: '2026-06-01',
          email: null,
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
        },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await getVendors1099Status(db, 'entity-1', 'US');

    expect(result).toHaveLength(1);
    expect(result[0].exceeds1099Threshold).toBe(true);
    expect(result[0].needs1099Filing).toBe(true);
    expect(result[0].ytdPayments).toBe(750);
  });

  it('does NOT flag vendor with ytd < $600 for 1099 filing', async () => {
    const chain = createChainMock({
      data: [
        {
          id: 'v-2',
          entity_id: 'entity-1',
          name: 'Small Vendor',
          normalized_name: 'small vendor',
          vendor_type: 'contractor',
          w9_status: 'verified',
          w9_received_at: '2025-06-01T00:00:00Z',
          is_1099_eligible: true,
          ytd_payments: 450,
          ytd_payment_count: 3,
          last_payment_date: '2026-03-01',
          email: null,
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2026-03-01T00:00:00Z',
        },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await getVendors1099Status(db, 'entity-1', 'US');

    expect(result).toHaveLength(1);
    expect(result[0].exceeds1099Threshold).toBe(false);
    expect(result[0].needs1099Filing).toBe(false);
  });

  it('flags vendor with expired W-9', async () => {
    // W-9 received 4 years ago → expired (threshold is 3 years)
    const fourYearsAgo = new Date();
    fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);

    const chain = createChainMock({
      data: [
        {
          id: 'v-3',
          entity_id: 'entity-1',
          name: 'Expired W9 Vendor',
          normalized_name: 'expired w9 vendor',
          vendor_type: 'contractor',
          w9_status: 'verified',
          w9_received_at: fourYearsAgo.toISOString(),
          is_1099_eligible: true,
          ytd_payments: 800,
          ytd_payment_count: 8,
          last_payment_date: '2026-05-01',
          email: null,
          is_active: true,
          created_at: '2020-01-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await getVendors1099Status(db, 'entity-1', 'US');

    expect(result).toHaveLength(1);
    expect(result[0].w9Expired).toBe(true);
    expect(result[0].w9Status).toBe('expired');
    expect(result[0].needsW9Collection).toBe(true);
  });

  it('returns empty array on DB error', async () => {
    const chain = createChainMock({ data: null, error: { message: 'timeout' } });
    mockDb.from.mockReturnValue(chain);

    const result = await getVendors1099Status(db, 'entity-1', 'US');

    expect(result).toEqual([]);
  });
});

// ─── getW9Summary ───────────────────────────────────────────────────────────────

describe('getW9Summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zeroed summary when no vendors exist', async () => {
    const chain = createChainMock({ data: [], error: null });
    mockDb.from.mockReturnValue(chain);

    const result = await getW9Summary(db, 'entity-1');

    expect(result).toEqual({
      totalVendors: 0,
      verified: 0,
      pending: 0,
      notCollected: 0,
      expired: 0,
      needsAttention: 0,
    });
  });

  it('correctly tallies verified, pending, and notCollected vendors', async () => {
    const chain = createChainMock({
      data: [
        { w9_status: 'verified', w9_received_at: '2025-01-01T00:00:00Z', is_1099_eligible: true, ytd_payments: 100 },
        { w9_status: 'received', w9_received_at: '2025-06-01T00:00:00Z', is_1099_eligible: false, ytd_payments: 200 },
        { w9_status: 'requested', w9_received_at: null, is_1099_eligible: true, ytd_payments: 50 },
        { w9_status: 'not_collected', w9_received_at: null, is_1099_eligible: true, ytd_payments: 700 },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await getW9Summary(db, 'entity-1', 'US');

    expect(result.totalVendors).toBe(4);
    expect(result.verified).toBe(2);   // 'verified' + 'received'
    expect(result.pending).toBe(1);    // 'requested'
    expect(result.notCollected).toBe(1); // 'not_collected'
    expect(result.needsAttention).toBe(1); // 1099-eligible, >=600, not verified
  });
});
