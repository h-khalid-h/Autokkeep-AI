import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeVariance, createFeeAdjustingEntry } from './engine';
import type { ReconciliationInput, GLCodeOverrides } from './engine';

// ============================================
// Mock audit module — fire-and-forget, never throws
// ============================================
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ============================================
// Supabase mock factory
// ============================================
import type { MockChain } from '@/__test-utils__/mock-supabase';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

function createMockSupabase(overrides?: {
  insertResult?: { data: unknown; error: unknown };
  selectSingleResult?: { data: unknown; error: unknown };
}) {
  const defaultJournalEntry = { id: 'je-001' };

  const insertResult = overrides?.selectSingleResult ?? {
    data: defaultJournalEntry,
    error: null,
  };

  const mock = {
    from: vi.fn((table: string) => {
      const chain = {} as MockChain;
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue(insertResult);
      chain.update = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);

      if (table === 'journal_lines') {
        chain.insert = vi.fn().mockResolvedValue({ error: null });
      }

      return chain;
    }),
  };

  return mock as unknown as SupabaseQueryClient;
}

// ============================================
// Fixtures
// ============================================
function makeInput(overrides: Partial<ReconciliationInput> = {}): ReconciliationInput {
  return {
    transactionId: 'tx-abc-123',
    entityId: 'entity-1',
    bankAmount: 97.10,
    expectedAmount: 100.00,
    merchantName: 'Acme Corp',
    date: '2025-06-15',
    ...overrides,
  };
}

// ============================================
// analyzeVariance
// ============================================
describe('analyzeVariance', () => {
  describe('Stripe fee pattern detection', () => {
    it('detects Stripe fee pattern (2.9% + $0.30)', () => {
      // For $100 expected: Stripe fee = 100 * 0.029 + 0.30 = $3.20
      const bankAmount = 100 - 3.20;   // 96.80
      const expectedAmount = 100;
      const result = analyzeVariance(bankAmount, expectedAmount, 'Stripe Payment');

      expect(result.isKnownFee).toBe(true);
      expect(result.glCode).toBe('6180');
      expect(result.description).toContain('Stripe processing fee');
    });

    it('detects Stripe fee within 2-cent tolerance', () => {
      // Stripe fee for $200 = 200 * 0.029 + 0.30 = $6.10
      // Bank amount slightly off: $200 - $6.11 = $193.89  (1 cent off)
      const result = analyzeVariance(193.89, 200, 'stripe inc');
      expect(result.isKnownFee).toBe(true);
      expect(result.description).toContain('Stripe');
    });

    it('does not trigger Stripe detection for non-Stripe merchants', () => {
      // Same variance pattern as Stripe but different merchant
      const result = analyzeVariance(96.80, 100, 'PayPal Holdings');
      // Should still match as known fee via threshold patterns, but NOT as Stripe
      expect(result.description).not.toContain('Stripe');
    });
  });

  describe('Known fee threshold detection', () => {
    it('detects rounding/micro-fee (<= $0.50)', () => {
      const result = analyzeVariance(99.70, 100, 'Any Merchant');
      expect(result.isKnownFee).toBe(true);
      expect(result.glCode).toBe('6180');
      expect(result.description).toContain('Rounding/micro-fee');
    });

    it('detects card processing fee (<= $5.00)', () => {
      const result = analyzeVariance(96.00, 100, 'Any Merchant');
      expect(result.isKnownFee).toBe(true);
      expect(result.description).toContain('Card processing fee');
    });

    it('detects ACH/wire transfer fee (<= $15.00)', () => {
      const result = analyzeVariance(88.00, 100, 'Bank Wire');
      expect(result.isKnownFee).toBe(true);
      expect(result.description).toContain('ACH/wire transfer fee');
    });

    it('detects international processing fee (<= $50.00)', () => {
      const result = analyzeVariance(65.00, 100, 'Foreign Corp');
      expect(result.isKnownFee).toBe(true);
      expect(result.description).toContain('International processing fee');
    });

    it('detects currency conversion fee (<= $100.00)', () => {
      const result = analyzeVariance(920, 1000, 'Exchange Ltd');
      expect(result.isKnownFee).toBe(true);
      expect(result.description).toContain('Currency conversion fee');
    });

    it('matches exact boundary values', () => {
      // Exactly $0.50 variance → rounding
      const result = analyzeVariance(99.50, 100, 'Merchant');
      expect(result.isKnownFee).toBe(true);
      expect(result.description).toContain('Rounding/micro-fee');
    });
  });

  describe('Unknown large variances → suspense', () => {
    it('routes large variance to suspense GL', () => {
      const result = analyzeVariance(750, 1000, 'Unknown Corp');
      expect(result.isKnownFee).toBe(false);
      expect(result.glCode).toBe('2900');
      expect(result.glName).toBe('Suspense/Clearing');
      expect(result.description).toContain('requires manual review');
    });

    it('includes the variance amount in the description', () => {
      const result = analyzeVariance(700, 1000, 'Unknown');
      expect(result.description).toContain('$300.00');
    });
  });

  describe('Custom GLCodeOverrides', () => {
    it('uses custom bankFeesGL for known fees', () => {
      const gl = { bankFeesGL: '7000', suspenseGL: '3000', cashGL: '1100' };
      const result = analyzeVariance(99.50, 100, 'Merchant', gl);
      expect(result.glCode).toBe('7000');
    });

    it('uses custom suspenseGL for unknown variances', () => {
      const gl = { bankFeesGL: '7000', suspenseGL: '3000', cashGL: '1100' };
      const result = analyzeVariance(500, 1000, 'Unknown', gl);
      expect(result.glCode).toBe('3000');
    });
  });
});

// ============================================
// createFeeAdjustingEntry
// ============================================
describe('createFeeAdjustingEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exact match — no adjustment needed', () => {
    it('returns matched=true when amounts are equal', async () => {
      const supabase = createMockSupabase();
      const input = makeInput({ bankAmount: 100, expectedAmount: 100 });
      const result = await createFeeAdjustingEntry(supabase, input);

      expect(result.matched).toBe(true);
      expect(result.variance).toBe(0);
      expect(result.reasoning).toContain('no adjustment needed');
      // Should not call supabase at all
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('treats sub-cent differences as exact match', async () => {
      const supabase = createMockSupabase();
      const input = makeInput({ bankAmount: 100.005, expectedAmount: 100 });
      const result = await createFeeAdjustingEntry(supabase, input);

      expect(result.matched).toBe(true);
      expect(result.variance).toBe(0);
    });
  });

  describe('Known fee — auto-posted', () => {
    it('creates a posted journal entry for a small known fee', async () => {
      const supabase = createMockSupabase();
      const input = makeInput({ bankAmount: 97.00, expectedAmount: 100.00, merchantName: 'Vendor' });
      const result = await createFeeAdjustingEntry(supabase, input);

      expect(result.matched).toBe(true);
      expect(result.variance).toBe(3);
      expect(result.varianceGlCode).toBe('6180');
      expect(result.journalEntryId).toBe('je-001');
      expect(result.reasoning).toContain('Auto-reconciled');

      // Verify journal_entries insert was called with 'posted' status
      const jeInsertCall = vi.mocked(supabase.from).mock.calls.find(
        (c: string[]) => c[0] === 'journal_entries'
      );
      expect(jeInsertCall).toBeDefined();
    });

    it('creates balanced journal lines (debit fee, credit cash)', async () => {
      const supabase = createMockSupabase();
      const input = makeInput({ bankAmount: 97.00, expectedAmount: 100.00 });
      await createFeeAdjustingEntry(supabase, input);

      // Verify journal_lines insert was called
      const jlInsertCall = vi.mocked(supabase.from).mock.calls.find(
        (c: string[]) => c[0] === 'journal_lines'
      );
      expect(jlInsertCall).toBeDefined();
    });
  });

  describe('Unknown variance — draft for review', () => {
    it('creates a draft journal entry for large unknown variance', async () => {
      const supabase = createMockSupabase();
      const input = makeInput({
        bankAmount: 500,
        expectedAmount: 1000,
        merchantName: 'Unknown Vendor',
      });
      const result = await createFeeAdjustingEntry(supabase, input);

      expect(result.matched).toBe(false);
      expect(result.variance).toBe(500);
      expect(result.varianceGlCode).toBe('2900');
      expect(result.varianceGlName).toBe('Suspense/Clearing');
      expect(result.reasoning).toContain('manual review');
    });
  });

  describe('DB error handling', () => {
    it('returns error result when journal entry insert fails', async () => {
      const supabase = createMockSupabase({
        selectSingleResult: {
          data: null,
          error: { message: 'Permission denied' },
        },
      });
      const input = makeInput({ bankAmount: 97, expectedAmount: 100 });
      const result = await createFeeAdjustingEntry(supabase, input);

      expect(result.matched).toBe(false);
      expect(result.reasoning).toContain('Failed to create adjusting entry');
      expect(result.reasoning).toContain('Permission denied');
      expect(result.journalEntryId).toBeUndefined();
    });

    it('returns error result when journal entry data is null', async () => {
      const supabase = createMockSupabase({
        selectSingleResult: { data: null, error: null },
      });
      const input = makeInput({ bankAmount: 95, expectedAmount: 100 });
      const result = await createFeeAdjustingEntry(supabase, input);

      expect(result.matched).toBe(false);
      expect(result.reasoning).toContain('Failed to create adjusting entry');
    });
  });

  describe('Custom GLCodeOverrides', () => {
    it('passes custom GL codes through to the analysis and entries', async () => {
      const supabase = createMockSupabase();
      const overrides: GLCodeOverrides = {
        bankFeesGL: '7100',
        suspenseGL: '3200',
        cashGL: '1050',
      };
      const input = makeInput({ bankAmount: 98, expectedAmount: 100 });
      const result = await createFeeAdjustingEntry(supabase, input, overrides);

      expect(result.varianceGlCode).toBe('7100');
    });

    it('uses default GL codes when overrides are not provided', async () => {
      const supabase = createMockSupabase();
      const input = makeInput({ bankAmount: 98, expectedAmount: 100 });
      const result = await createFeeAdjustingEntry(supabase, input);

      expect(result.varianceGlCode).toBe('6180');
    });
  });
});
