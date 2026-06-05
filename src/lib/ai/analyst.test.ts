import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock OpenAI (via shared openai-client) ──────────────────────────────────

const mockCreate = vi.fn();
(globalThis as Record<string, unknown>).__mockOpenAICreate = mockCreate;

vi.mock('./openai-client', () => {
  const create = (globalThis as Record<string, unknown>).__mockOpenAICreate;
  return {
    callWithFallback: (createParams: (model: string) => unknown) => {
      const model = process.env.OPENAI_MODEL || 'gpt-4o';
      const params = createParams(model);
      return (create as (...args: unknown[]) => unknown)(params);
    },
  };
});

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ── Supabase mock helpers ────────────────────────────────────────────────────

function createQueryChainMock(transactions: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) =>
    resolve({ data: transactions, error: null })
  );
  return chain;
}

const mockDb = {
  from: vi.fn(),
  storage: { from: vi.fn() },
  rpc: vi.fn(),
  auth: {},
};
const db = mockDb as unknown as SupabaseQueryClient;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AI analyst — analyzeFinancialQuestion', () => {
  const originalEnv = process.env;
  // We re-import the module fresh each test to reset the singleton openaiClient
  let analyzeFinancialQuestion: (
    q: string,
    entityId: string,
    supabase: SupabaseQueryClient
  ) => Promise<import('./analyst').AnalystResponse>;

  beforeEach(async () => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' };
    vi.clearAllMocks();
    // Reset the module so openaiClient singleton is recreated each test
    vi.resetModules();
    const mod = await import('./analyst');
    analyzeFinancialQuestion = mod.analyzeFinancialQuestion;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function setupTransactions(txns: unknown[]) {
    mockDb.from.mockReturnValue(createQueryChainMock(txns));
  }

  const OPENAI_SUCCESS_RESPONSE = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            answer: 'Your top expense is Office Supplies at $150.00.',
            data_citations: [
              { metric: 'Office Supplies', value: '$150.00', period: 'Last 90 days' },
            ],
            suggested_follow_ups: ['What is my monthly trend?'],
            confidence: 'high',
          }),
        },
      },
    ],
  };

  // ── Happy path ──────────────────────────────────────────────────────────

  it('analyzes transactions and returns structured response', async () => {
    setupTransactions([
      {
        id: 'tx-1',
        amount: 100.5,
        date: '2026-05-01',
        merchant_name: 'Office Depot',
        merchant_raw: 'OFFICE DEPOT #123',
        category_ai: 'Office Supplies',
        category_human: null,
        status: 'posted',
        currency: 'USD',
      },
      {
        id: 'tx-2',
        amount: -500,
        date: '2026-05-05',
        merchant_name: 'Client Payment',
        merchant_raw: 'ACH DEPOSIT',
        category_ai: 'Income',
        category_human: 'Revenue',
        status: 'posted',
        currency: 'USD',
      },
    ]);
    mockCreate.mockResolvedValue(OPENAI_SUCCESS_RESPONSE);

    const result = await analyzeFinancialQuestion('What are my top expenses?', 'entity-1', db);

    expect(result.answer).toContain('Office Supplies');
    expect(result.confidence).toBe('high');
    expect(result.dataCitations).toHaveLength(1);
    expect(result.suggestedFollowUps).toHaveLength(1);
  });

  // ── Integer-cents accumulators (no floating-point drift) ────────────────

  it('uses integer-cents accumulators to avoid floating-point drift', async () => {
    // Three transactions of $0.10 each — naive addition gives 0.30000000000000004
    setupTransactions([
      { id: 'tx-1', amount: 0.1, date: '2026-05-01', merchant_name: 'A', merchant_raw: null, category_ai: 'Misc', category_human: null, status: 'posted', currency: 'USD' },
      { id: 'tx-2', amount: 0.1, date: '2026-05-02', merchant_name: 'B', merchant_raw: null, category_ai: 'Misc', category_human: null, status: 'posted', currency: 'USD' },
      { id: 'tx-3', amount: 0.1, date: '2026-05-03', merchant_name: 'C', merchant_raw: null, category_ai: 'Misc', category_human: null, status: 'posted', currency: 'USD' },
    ]);

    // The function builds financial context internally; the fallback response
    // reveals the computed totalExpenses when OpenAI fails.
    mockCreate.mockRejectedValue(new Error('API down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await analyzeFinancialQuestion('expenses?', 'entity-1', db);

    // If cents accumulation works, total is exactly 0.30, not 0.30000000000000004
    expect(result.answer).toContain('$0.30');
    expect(result.answer).not.toContain('0.30000000000000004');

    consoleSpy.mockRestore();
  });

  // ── Income/expense classification (Plaid convention) ───────────────────

  it('classifies negative amounts as income and positive as expense', async () => {
    setupTransactions([
      { id: 'tx-e', amount: 200, date: '2026-05-01', merchant_name: 'Vendor', merchant_raw: null, category_ai: 'Expense', category_human: null, status: 'posted', currency: 'USD' },
      { id: 'tx-i', amount: -300, date: '2026-05-01', merchant_name: 'Client', merchant_raw: null, category_ai: 'Income', category_human: null, status: 'posted', currency: 'USD' },
    ]);

    mockCreate.mockRejectedValue(new Error('offline'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await analyzeFinancialQuestion('summary', 'entity-1', db);

    // Fallback response includes income=$300 and expenses=$200
    expect(result.answer).toContain('$300.00'); // income
    expect(result.answer).toContain('$200.00'); // expenses

    consoleSpy.mockRestore();
  });

  // ── Empty transaction list ─────────────────────────────────────────────

  it('handles empty transaction list gracefully', async () => {
    setupTransactions([]);
    mockCreate.mockRejectedValue(new Error('API down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await analyzeFinancialQuestion('What is my revenue?', 'entity-1', db);

    expect(result.confidence).toBe('low');
    expect(result.answer).toContain("don't have enough transaction data");

    consoleSpy.mockRestore();
  });

  // ── OpenAI failure fallback ───────────────────────────────────────────

  it('provides fallback response when OpenAI call fails', async () => {
    setupTransactions([
      { id: 'tx-1', amount: 50, date: '2026-05-01', merchant_name: 'Store', merchant_raw: null, category_ai: 'Supplies', category_human: null, status: 'posted', currency: 'USD' },
    ]);
    mockCreate.mockRejectedValue(new Error('Rate limit'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await analyzeFinancialQuestion('expenses?', 'entity-1', db);

    expect(result.confidence).toBe('low');
    expect(result.answer).toContain('1 transactions');
    expect(result.suggestedFollowUps.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });

  // ── Empty OpenAI content ──────────────────────────────────────────────

  it('falls back when OpenAI returns empty content', async () => {
    setupTransactions([
      { id: 'tx-1', amount: 10, date: '2026-05-01', merchant_name: 'A', merchant_raw: null, category_ai: 'X', category_human: null, status: 'posted', currency: 'USD' },
    ]);
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await analyzeFinancialQuestion('test?', 'entity-1', db);

    expect(result.confidence).toBe('low');
    expect(result.dataCitations).toEqual([]);

    consoleSpy.mockRestore();
  });
});

