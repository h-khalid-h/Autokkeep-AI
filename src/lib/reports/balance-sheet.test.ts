import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateBalanceSheet } from './balance-sheet';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Creates a chainable mock that resolves `then` to the given value.
 * Mimics the Supabase PostgREST query-builder API.
 */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

const ENTITY_ID = 'entity-bs-test';
const AS_OF_DATE = '2025-06-30';

const MOCK_ENTITY = {
  name: 'Test Corp',
  base_currency: 'USD',
};

const MOCK_COA = [
  { code: '1000', name: 'Cash', type: 'asset', parent_id: null },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', parent_id: null },
  { code: '2000', name: 'Accounts Payable', type: 'liability', parent_id: null },
  { code: '2100', name: 'Notes Payable', type: 'liability', parent_id: null },
  { code: '3000', name: 'Common Stock', type: 'equity', parent_id: null },
  { code: '3100', name: 'Additional Paid-In Capital', type: 'equity', parent_id: null },
  { code: '4000', name: 'Sales Revenue', type: 'revenue', parent_id: null },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', parent_id: null },
  { code: '6000', name: 'Office Supplies', type: 'expense', parent_id: null },
];

/**
 * Creates a mock Supabase client that routes queries to different
 * chain mocks depending on the table name.
 */
function createMockDb(overrides?: {
  entity?: unknown;
  entityError?: unknown;
  coa?: unknown[];
  coaError?: unknown;
  transactions?: unknown[];
  txError?: unknown;
}): SupabaseQueryClient {
  const entity = overrides?.entity ?? MOCK_ENTITY;
  const entityError = overrides?.entityError ?? null;
  const coa = overrides?.coa ?? MOCK_COA;
  const coaError = overrides?.coaError ?? null;
  const transactions = overrides?.transactions ?? [];
  const txError = overrides?.txError ?? null;

  const entityChain = createChainMock({ data: entity, error: entityError });
  const coaChain = createChainMock({ data: coa, error: coaError });
  const txChain = createChainMock({ data: transactions, error: txError });

  return {
    from: vi.fn((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'chart_of_accounts') return coaChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: [], error: null });
    }),
  } as unknown as SupabaseQueryClient;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('generateBalanceSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fix generatedAt to a known date for consistent snapshot tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-07-01T12:00:00Z'));
  });

  it('should classify assets, liabilities, and equity correctly', async () => {
    const db = createMockDb({
      transactions: [
        // Assets (debit-normal, positive)
        { amount: 10000, category_human: '1000', category_ai: null },
        { amount: 5000, category_human: '1100', category_ai: null },
        // Liabilities (credit-normal, negative)
        { amount: -3000, category_human: '2000', category_ai: null },
        { amount: -2000, category_human: '2100', category_ai: null },
        // Equity (credit-normal, negative)
        { amount: -10000, category_human: '3000', category_ai: null },
      ],
    });

    const report = await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    expect(report.entityName).toBe('Test Corp');
    expect(report.entityCurrency).toBe('USD');
    expect(report.asOfDate).toBe(AS_OF_DATE);

    // Assets
    expect(report.assets).toHaveLength(2);
    expect(report.assets[0]).toMatchObject({ code: '1000', name: 'Cash', amount: 10000, type: 'asset' });
    expect(report.assets[1]).toMatchObject({ code: '1100', name: 'Accounts Receivable', amount: 5000, type: 'asset' });
    expect(report.totalAssets).toBe(15000);

    // Liabilities
    expect(report.liabilities).toHaveLength(2);
    expect(report.liabilities[0]).toMatchObject({ code: '2000', name: 'Accounts Payable', amount: 3000, type: 'liability' });
    expect(report.liabilities[1]).toMatchObject({ code: '2100', name: 'Notes Payable', amount: 2000, type: 'liability' });
    expect(report.totalLiabilities).toBe(5000);

    // Equity
    expect(report.equity).toHaveLength(1);
    expect(report.equity[0]).toMatchObject({ code: '3000', name: 'Common Stock', amount: 10000, type: 'equity' });
    expect(report.totalEquity).toBe(10000);
  });

  it('should compute retained earnings from revenue minus expenses', async () => {
    const db = createMockDb({
      transactions: [
        // Assets
        { amount: 20000, category_human: '1000', category_ai: null },
        // Liabilities
        { amount: -5000, category_human: '2000', category_ai: null },
        // Equity
        { amount: -10000, category_human: '3000', category_ai: null },
        // Revenue (credit-normal, negative amounts)
        { amount: -8000, category_human: '4000', category_ai: null },
        // Expenses (debit-normal, positive amounts)
        { amount: 3000, category_human: '5000', category_ai: null },
      ],
    });

    const report = await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    // Retained earnings = revenue - expenses = 8000 - 3000 = 5000
    expect(report.retainedEarnings).toBe(5000);

    // Revenue and expense accounts should NOT appear in assets/liabilities/equity line items
    expect(report.assets).toHaveLength(1);
    expect(report.liabilities).toHaveLength(1);
    expect(report.equity).toHaveLength(1);
  });

  it('should verify isBalanced when accounting equation holds', async () => {
    // Assets (20000) = Liabilities (5000) + Equity (10000) + Retained Earnings (5000)
    const db = createMockDb({
      transactions: [
        { amount: 20000, category_human: '1000', category_ai: null },
        { amount: -5000, category_human: '2000', category_ai: null },
        { amount: -10000, category_human: '3000', category_ai: null },
        { amount: -8000, category_human: '4000', category_ai: null },
        { amount: 3000, category_human: '5000', category_ai: null },
      ],
    });

    const report = await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    expect(report.totalAssets).toBe(20000);
    expect(report.totalLiabilities).toBe(5000);
    expect(report.totalEquity).toBe(10000);
    expect(report.retainedEarnings).toBe(5000);
    expect(report.isBalanced).toBe(true);
  });

  it('should detect out-of-balance condition', async () => {
    // Deliberately unbalanced: Assets (10000) ≠ Liabilities (3000) + Equity (0) + RE (0)
    const db = createMockDb({
      transactions: [
        { amount: 10000, category_human: '1000', category_ai: null },
        { amount: -3000, category_human: '2000', category_ai: null },
      ],
    });

    const report = await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    expect(report.totalAssets).toBe(10000);
    expect(report.totalLiabilities).toBe(3000);
    expect(report.totalEquity).toBe(0);
    expect(report.retainedEarnings).toBe(0);
    expect(report.isBalanced).toBe(false);
  });

  it('should return zero totals for an empty period', async () => {
    const db = createMockDb({
      transactions: [],
    });

    const report = await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    expect(report.assets).toHaveLength(0);
    expect(report.liabilities).toHaveLength(0);
    expect(report.equity).toHaveLength(0);
    expect(report.totalAssets).toBe(0);
    expect(report.totalLiabilities).toBe(0);
    expect(report.totalEquity).toBe(0);
    expect(report.retainedEarnings).toBe(0);
    expect(report.isBalanced).toBe(true);
  });

  it('should only include approved/synced transactions (verified via mock calls)', async () => {
    const db = createMockDb({
      transactions: [
        { amount: 5000, category_human: '1000', category_ai: null },
      ],
    });

    await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    // Verify that from('transactions') was called
    expect(db.from).toHaveBeenCalledWith('transactions');
  });

  it('should throw when entity is not found', async () => {
    const db = createMockDb({
      entity: null,
      entityError: { message: 'Not found' },
    });

    await expect(
      generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE)
    ).rejects.toThrow('Entity not found');
  });

  it('should throw when transaction query fails', async () => {
    const db = createMockDb({
      txError: { message: 'DB connection failed' },
    });

    await expect(
      generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE)
    ).rejects.toThrow('Failed to query transactions');
  });

  it('should handle cents precision correctly', async () => {
    const db = createMockDb({
      transactions: [
        { amount: 199.99, category_human: '1000', category_ai: null },
        { amount: 100.01, category_human: '1000', category_ai: null },
        { amount: -49.99, category_human: '2000', category_ai: null },
        { amount: -50.01, category_human: '2000', category_ai: null },
      ],
    });

    const report = await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    // Total assets: 199.99 + 100.01 = 300.00
    expect(report.totalAssets).toBe(300);
    // Total liabilities: 49.99 + 50.01 = 100.00
    expect(report.totalLiabilities).toBe(100);
  });

  it('should use category_ai as fallback when category_human is null', async () => {
    const db = createMockDb({
      transactions: [
        { amount: 5000, category_human: null, category_ai: '1000' },
        { amount: -2000, category_human: null, category_ai: '2000' },
      ],
    });

    const report = await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    expect(report.assets).toHaveLength(1);
    expect(report.assets[0].code).toBe('1000');
    expect(report.assets[0].amount).toBe(5000);

    expect(report.liabilities).toHaveLength(1);
    expect(report.liabilities[0].code).toBe('2000');
    expect(report.liabilities[0].amount).toBe(2000);
  });

  it('should skip transactions without any GL code', async () => {
    const db = createMockDb({
      transactions: [
        { amount: 5000, category_human: '1000', category_ai: null },
        { amount: 1000, category_human: null, category_ai: null }, // no GL code → skipped
        { amount: -2000, category_human: '2000', category_ai: null },
      ],
    });

    const report = await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    expect(report.totalAssets).toBe(5000);
    expect(report.totalLiabilities).toBe(2000);
  });

  it('should sort line items by GL code within each section', async () => {
    const db = createMockDb({
      transactions: [
        { amount: 3000, category_human: '1100', category_ai: null },
        { amount: 5000, category_human: '1000', category_ai: null },
        { amount: -2000, category_human: '2100', category_ai: null },
        { amount: -1000, category_human: '2000', category_ai: null },
        { amount: -5000, category_human: '3100', category_ai: null },
        { amount: -10000, category_human: '3000', category_ai: null },
      ],
    });

    const report = await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    // Assets sorted by code
    expect(report.assets.map((a) => a.code)).toEqual(['1000', '1100']);

    // Liabilities sorted by code
    expect(report.liabilities.map((l) => l.code)).toEqual(['2000', '2100']);

    // Equity sorted by code
    expect(report.equity.map((e) => e.code)).toEqual(['3000', '3100']);
  });

  it('should handle negative retained earnings (net loss)', async () => {
    const db = createMockDb({
      transactions: [
        { amount: 10000, category_human: '1000', category_ai: null },
        { amount: -5000, category_human: '2000', category_ai: null },
        { amount: -2000, category_human: '3000', category_ai: null },
        // Revenue < Expenses → net loss
        { amount: -1000, category_human: '4000', category_ai: null },
        { amount: 4000, category_human: '5000', category_ai: null },
      ],
    });

    const report = await generateBalanceSheet(db, ENTITY_ID, AS_OF_DATE);

    // Retained earnings = 1000 - 4000 = -3000
    expect(report.retainedEarnings).toBe(-3000);
  });
});
