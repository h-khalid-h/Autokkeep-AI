import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateProfitAndLoss } from './profit-loss';
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

const ENTITY_ID = 'entity-pnl-test';
const PERIOD_START = '2025-01-01';
const PERIOD_END = '2025-06-30';

const MOCK_ENTITY = {
  name: 'Test Corp',
  base_currency: 'USD',
};

const MOCK_COA = [
  { code: '4000', name: 'Sales Revenue', type: 'revenue', parent_id: null },
  { code: '4100', name: 'Service Revenue', type: 'revenue', parent_id: null },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', parent_id: null },
  { code: '6000', name: 'Office Supplies', type: 'expense', parent_id: null },
  { code: '6100', name: 'Rent Expense', type: 'expense', parent_id: null },
  { code: '1000', name: 'Cash', type: 'asset', parent_id: null },
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
  prevTransactions?: unknown[];
  prevTxError?: unknown;
}): SupabaseQueryClient {
  const entity = overrides?.entity ?? MOCK_ENTITY;
  const entityError = overrides?.entityError ?? null;
  const coa = overrides?.coa ?? MOCK_COA;
  const coaError = overrides?.coaError ?? null;
  const transactions = overrides?.transactions ?? [];
  const txError = overrides?.txError ?? null;
  const prevTransactions = overrides?.prevTransactions;
  const prevTxError = overrides?.prevTxError ?? null;

  // Track transaction query call count for comparison period support
  let txCallCount = 0;

  const entityChain = createChainMock({ data: entity, error: entityError });
  const coaChain = createChainMock({ data: coa, error: coaError });

  return {
    from: vi.fn((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'chart_of_accounts') return coaChain;
      if (table === 'transactions') {
        txCallCount++;
        // If prevTransactions provided and this is the 2nd call, use those
        if (txCallCount > 1 && prevTransactions !== undefined) {
          return createChainMock({ data: prevTransactions, error: prevTxError });
        }
        return createChainMock({ data: transactions, error: txError });
      }
      return createChainMock({ data: [], error: null });
    }),
  } as unknown as SupabaseQueryClient;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('generateProfitAndLoss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fix generatedAt to a known date for consistent snapshot tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-07-01T12:00:00Z'));
  });

  it('should generate P&L with mixed revenue and expense transactions', async () => {
    const db = createMockDb({
      transactions: [
        // Revenue: negative amounts (credits)
        { amount: -5000, category_human: '4000', category_ai: null },
        { amount: -3000, category_human: '4100', category_ai: null },
        // Expenses: positive amounts (debits)
        { amount: 2000, category_human: '5000', category_ai: null },
        { amount: 500, category_human: '6000', category_ai: null },
        { amount: 1500, category_human: '6100', category_ai: null },
      ],
    });

    const report = await generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END);

    expect(report.entityName).toBe('Test Corp');
    expect(report.entityCurrency).toBe('USD');
    expect(report.periodStart).toBe(PERIOD_START);
    expect(report.periodEnd).toBe(PERIOD_END);

    // Revenue items
    expect(report.revenue).toHaveLength(2);
    expect(report.revenue[0]).toMatchObject({ code: '4000', name: 'Sales Revenue', amount: 5000, type: 'revenue' });
    expect(report.revenue[1]).toMatchObject({ code: '4100', name: 'Service Revenue', amount: 3000, type: 'revenue' });
    expect(report.totalRevenue).toBe(8000);

    // Expense items
    expect(report.expenses).toHaveLength(3);
    expect(report.expenses[0]).toMatchObject({ code: '5000', name: 'Cost of Goods Sold', amount: 2000, type: 'expense' });
    expect(report.expenses[1]).toMatchObject({ code: '6000', name: 'Office Supplies', amount: 500, type: 'expense' });
    expect(report.expenses[2]).toMatchObject({ code: '6100', name: 'Rent Expense', amount: 1500, type: 'expense' });
    expect(report.totalExpenses).toBe(4000);

    // Net income = revenue - expenses
    expect(report.netIncome).toBe(4000);
  });

  it('should verify revenue and expense totals with cents precision', async () => {
    const db = createMockDb({
      transactions: [
        { amount: -199.99, category_human: '4000', category_ai: null },
        { amount: -100.01, category_human: '4000', category_ai: null },
        { amount: 49.99, category_human: '6000', category_ai: null },
        { amount: 50.01, category_human: '6000', category_ai: null },
      ],
    });

    const report = await generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END);

    // Revenue total should be exact: 199.99 + 100.01 = 300.00
    expect(report.totalRevenue).toBe(300);
    // Expense total should be exact: 49.99 + 50.01 = 100.00
    expect(report.totalExpenses).toBe(100);
    // Net income: 300 - 100 = 200
    expect(report.netIncome).toBe(200);
  });

  it('should verify net income calculation (revenue - expenses)', async () => {
    const db = createMockDb({
      transactions: [
        { amount: -10000, category_human: '4000', category_ai: null },
        { amount: 12000, category_human: '5000', category_ai: null },
      ],
    });

    const report = await generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END);

    expect(report.totalRevenue).toBe(10000);
    expect(report.totalExpenses).toBe(12000);
    // Net loss: revenue < expenses → negative net income
    expect(report.netIncome).toBe(-2000);
  });

  it('should compute comparison period metrics when comparePrevious is true', async () => {
    const db = createMockDb({
      transactions: [
        { amount: -5000, category_human: '4000', category_ai: null },
        { amount: 2000, category_human: '5000', category_ai: null },
      ],
      prevTransactions: [
        { amount: -3000, category_human: '4000', category_ai: null },
        { amount: 1000, category_human: '5000', category_ai: null },
      ],
    });

    const report = await generateProfitAndLoss(
      db,
      ENTITY_ID,
      PERIOD_START,
      PERIOD_END,
      { comparePrevious: true }
    );

    // Current period
    expect(report.totalRevenue).toBe(5000);
    expect(report.totalExpenses).toBe(2000);
    expect(report.netIncome).toBe(3000);

    // Comparison period should exist
    expect(report.comparisonPeriod).toBeDefined();
    expect(report.comparisonPeriod!.totalRevenue).toBe(3000);
    expect(report.comparisonPeriod!.totalExpenses).toBe(1000);
    expect(report.comparisonPeriod!.netIncome).toBe(2000);

    // Comparison period dates should be prior to current period
    expect(report.comparisonPeriod!.periodEnd < report.periodStart).toBe(true);
  });

  it('should not include comparison period when comparePrevious is false/undefined', async () => {
    const db = createMockDb({
      transactions: [
        { amount: -1000, category_human: '4000', category_ai: null },
      ],
    });

    const report = await generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END);

    expect(report.comparisonPeriod).toBeUndefined();
  });

  it('should return zero totals for an empty period', async () => {
    const db = createMockDb({
      transactions: [],
    });

    const report = await generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END);

    expect(report.revenue).toHaveLength(0);
    expect(report.expenses).toHaveLength(0);
    expect(report.totalRevenue).toBe(0);
    expect(report.totalExpenses).toBe(0);
    expect(report.netIncome).toBe(0);
  });

  it('should use category_ai as fallback when category_human is null', async () => {
    const db = createMockDb({
      transactions: [
        { amount: -2500, category_human: null, category_ai: '4000' },
        { amount: 750, category_human: null, category_ai: '6000' },
      ],
    });

    const report = await generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END);

    expect(report.revenue).toHaveLength(1);
    expect(report.revenue[0].code).toBe('4000');
    expect(report.revenue[0].amount).toBe(2500);

    expect(report.expenses).toHaveLength(1);
    expect(report.expenses[0].code).toBe('6000');
    expect(report.expenses[0].amount).toBe(750);
  });

  it('should skip transactions without any GL code', async () => {
    const db = createMockDb({
      transactions: [
        { amount: -1000, category_human: '4000', category_ai: null },
        { amount: 500, category_human: null, category_ai: null }, // no GL code → skipped
        { amount: 200, category_human: '6000', category_ai: null },
      ],
    });

    const report = await generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END);

    expect(report.totalRevenue).toBe(1000);
    expect(report.totalExpenses).toBe(200);
    expect(report.netIncome).toBe(800);
  });

  it('should skip asset/liability/equity accounts (not P&L accounts)', async () => {
    const db = createMockDb({
      transactions: [
        { amount: -1000, category_human: '4000', category_ai: null }, // revenue
        { amount: 500, category_human: '1000', category_ai: null },   // asset → skipped
      ],
    });

    const report = await generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END);

    expect(report.totalRevenue).toBe(1000);
    expect(report.totalExpenses).toBe(0);
    expect(report.netIncome).toBe(1000);
  });

  it('should throw when entity is not found', async () => {
    const db = createMockDb({
      entity: null,
      entityError: { message: 'Not found' },
    });

    await expect(
      generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END)
    ).rejects.toThrow('Entity not found');
  });

  it('should throw when transaction query fails', async () => {
    const db = createMockDb({
      txError: { message: 'DB connection failed' },
    });

    await expect(
      generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END)
    ).rejects.toThrow('Failed to query transactions');
  });

  it('should sort line items by GL code within each section', async () => {
    const db = createMockDb({
      transactions: [
        { amount: 300, category_human: '6100', category_ai: null },
        { amount: 100, category_human: '5000', category_ai: null },
        { amount: 200, category_human: '6000', category_ai: null },
        { amount: -500, category_human: '4100', category_ai: null },
        { amount: -1000, category_human: '4000', category_ai: null },
      ],
    });

    const report = await generateProfitAndLoss(db, ENTITY_ID, PERIOD_START, PERIOD_END);

    // Revenue sorted by code
    expect(report.revenue.map((r) => r.code)).toEqual(['4000', '4100']);

    // Expenses sorted by code
    expect(report.expenses.map((e) => e.code)).toEqual(['5000', '6000', '6100']);
  });
});
