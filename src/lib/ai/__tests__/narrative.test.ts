
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock OpenAI (via shared openai-client) ──────────────────────────────────

const mockCreate = vi.fn();
(globalThis as Record<string, unknown>).__mockOpenAICreate = mockCreate;

vi.mock('../openai-client', () => {
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

// ── Types ────────────────────────────────────────────────────────────────────

interface MockTransaction {
  id: string;
  amount: number;
  date: string;
  merchant_name: string | null;
  merchant_raw: string | null;
  category_ai: string | null;
  category_human: string | null;
  status: string;
  currency: string | null;
  created_at: string | null;
}

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<MockTransaction> = {}): MockTransaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100, // positive = expense (Plaid convention)
    date: '2025-06-15',
    merchant_name: 'Acme Corp',
    merchant_raw: 'ACME CORP #1234',
    category_ai: 'Software',
    category_human: null,
    status: 'posted',
    currency: 'USD',
    created_at: '2025-06-15T10:00:00Z',
    ...overrides,
  };
}

// ── Supabase mock factory ────────────────────────────────────────────────────

import type { MockChain } from '@/__test-utils__/mock-supabase';

function createMockSupabase(opts: {
  currentTransactions?: MockTransaction[];
  previousTransactions?: MockTransaction[];
  currentError?: { message: string } | null;
  previousError?: { message: string } | null;
  upsertError?: { message: string } | null;
} = {}): SupabaseQueryClient {
  const {
    currentTransactions = [],
    previousTransactions = [],
    currentError = null,
    previousError = null,
    upsertError = null,
  } = opts;

  let txFromCallCount = 0;

  const mock = {
    from: vi.fn((table: string) => {
      const chain = {} as MockChain;
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.neq = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.lte = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.upsert = vi.fn().mockResolvedValue({ error: upsertError });

      if (table === 'transactions') {
        txFromCallCount++;
        const currentCallNum = txFromCallCount;

        // The narrative module does two transaction queries:
        // Call #1: current month transactions
        // Call #2: previous month transactions
        // Both end with .limit() which returns the chain, then it's awaited
        chain.limit = vi.fn().mockImplementation(() => {
          if (currentCallNum === 1) {
            chain.then = (resolve: (v: unknown) => void) =>
              resolve({ data: currentError ? null : currentTransactions, error: currentError });
          } else {
            chain.then = (resolve: (v: unknown) => void) =>
              resolve({ data: previousError ? null : previousTransactions, error: previousError });
          }
          return chain;
        });
      } else if (table === 'financial_narratives') {
        chain.upsert = vi.fn().mockResolvedValue({ error: upsertError });
      }

      return chain;
    }),
  };

  return mock as unknown as SupabaseQueryClient;
}


// ── OpenAI mock response helper ──────────────────────────────────────────────

function makeOpenAIResponse(content: object | null) {
  return {
    choices: [
      {
        message: {
          content: content ? JSON.stringify(content) : null,
        },
      },
    ],
  };
}

const OPENAI_NARRATIVE_RESPONSE = makeOpenAIResponse({
  what_happened: [
    'Your business processed 5 transactions this month.',
    'Total revenue was $1,000.00 with expenses of $500.00.',
  ],
  why_it_happened: [
    'Revenue increased by 25% due to new client payments.',
  ],
  what_changed: [
    'Expenses decreased by 10% compared to last month.',
    '2 new vendors appeared this month.',
  ],
  requires_attention: [
    'Software expenses increased by 50% — review subscriptions.',
  ],
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generateMonthlyNarrative', () => {
  const originalEnv = process.env;

  let generateMonthlyNarrative: (
    entityId: string,
    year: number,
    month: number,
    supabase: SupabaseQueryClient,
  ) => Promise<import('../narrative').FinancialNarrative>;

  beforeEach(async () => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' };
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../narrative');
    generateMonthlyNarrative = mod.generateMonthlyNarrative;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('returns a complete FinancialNarrative with expected shape', async () => {
      const currentTxns = [
        makeTx({ amount: 200, category_ai: 'Software' }),
        makeTx({ amount: 150, category_ai: 'Office Supplies' }),
        makeTx({ amount: -500, category_ai: 'Income' }),
      ];
      const previousTxns = [
        makeTx({ amount: 100, category_ai: 'Software', date: '2025-05-15' }),
        makeTx({ amount: -400, category_ai: 'Income', date: '2025-05-10' }),
      ];

      const supabase = createMockSupabase({
        currentTransactions: currentTxns,
        previousTransactions: previousTxns,
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      // Period
      expect(result.period.start).toBe('2025-06-01');
      expect(result.period.end).toBe('2025-06-30');

      // Summary
      expect(typeof result.summary.totalRevenue).toBe('number');
      expect(typeof result.summary.totalExpenses).toBe('number');
      expect(typeof result.summary.netIncome).toBe('number');
      expect(typeof result.summary.revenueChange).toBe('number');
      expect(typeof result.summary.expenseChange).toBe('number');

      // Sections from OpenAI
      expect(result.sections.whatHappened).toHaveLength(2);
      expect(result.sections.whyItHappened).toHaveLength(1);
      expect(result.sections.whatChanged).toHaveLength(2);
      expect(result.sections.requiresAttention).toHaveLength(1);

      // Top categories
      expect(Array.isArray(result.topCategories)).toBe(true);

      // Generated at
      expect(result.generatedAt).toBeTruthy();
      expect(() => new Date(result.generatedAt)).not.toThrow();
    });

    it('computes correct revenue and expense totals (Plaid convention)', async () => {
      const currentTxns = [
        makeTx({ amount: 200 }),    // expense (positive)
        makeTx({ amount: 300 }),    // expense (positive)
        makeTx({ amount: -1000 }),  // income (negative)
      ];

      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.totalRevenue).toBe(1000);
      expect(result.summary.totalExpenses).toBe(500);
      expect(result.summary.netIncome).toBe(500);
    });

    it('computes correct change percentages', async () => {
      const currentTxns = [makeTx({ amount: -200 })]; // revenue = 200
      const previousTxns = [makeTx({ amount: -100, date: '2025-05-15' })]; // revenue = 100

      const supabase = createMockSupabase({
        currentTransactions: currentTxns,
        previousTransactions: previousTxns,
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      // Revenue went from 100 to 200 = 100% increase
      expect(result.summary.revenueChange).toBe(100);
    });

    it('stores narrative via upsert to financial_narratives table', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [makeTx()],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      // Verify supabase.from was called with 'financial_narratives'
      const calls = vi.mocked(supabase.from).mock.calls;
      const narrativeCalls = calls.filter((c: unknown[]) => c[0] === 'financial_narratives');
      expect(narrativeCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Period calculation ──────────────────────────────────────────────────

  describe('period calculation', () => {
    it('calculates correct period for January (previous month is December of prior year)', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [makeTx({ date: '2025-01-15' })],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 1, supabase);

      expect(result.period.start).toBe('2025-01-01');
      expect(result.period.end).toBe('2025-01-31');
    });

    it('handles February in a leap year', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [makeTx({ date: '2024-02-15' })],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2024, 2, supabase);

      expect(result.period.start).toBe('2024-02-01');
      expect(result.period.end).toBe('2024-02-29');
    });

    it('handles February in a non-leap year', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [makeTx({ date: '2025-02-15' })],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 2, supabase);

      expect(result.period.start).toBe('2025-02-01');
      expect(result.period.end).toBe('2025-02-28');
    });
  });

  // ── Empty data ──────────────────────────────────────────────────────────

  describe('empty data', () => {
    it('handles empty transactions gracefully — zeros for summary', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [],
        previousTransactions: [],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.totalRevenue).toBe(0);
      expect(result.summary.totalExpenses).toBe(0);
      expect(result.summary.netIncome).toBe(0);
      expect(result.summary.revenueChange).toBe(0);
      expect(result.summary.expenseChange).toBe(0);
      expect(result.topCategories).toEqual([]);
    });

    it('handles current month empty with previous month data', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [],
        previousTransactions: [makeTx({ amount: -500, date: '2025-05-15' })],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.totalRevenue).toBe(0);
      expect(result.summary.totalExpenses).toBe(0);
    });

    it('handles null data from Supabase (treated as empty)', async () => {
      // When there's no error but data is null, it defaults to []
      const supabase = createMockSupabase({
        currentTransactions: [],
        previousTransactions: [],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.totalRevenue).toBe(0);
      expect(result.topCategories).toEqual([]);
    });
  });

  // ── Supabase query errors ──────────────────────────────────────────────

  describe('Supabase query errors', () => {
    it('throws when current month query fails', async () => {
      const supabase = createMockSupabase({
        currentError: { message: 'connection timeout' },
      });

      await expect(
        generateMonthlyNarrative('entity-1', 2025, 6, supabase)
      ).rejects.toThrow('Cannot generate narrative: transaction data unavailable (connection timeout)');
    });

    it('throws when previous month query fails', async () => {
      const supabase = createMockSupabase({
        previousError: { message: 'permission denied' },
      });

      await expect(
        generateMonthlyNarrative('entity-1', 2025, 6, supabase)
      ).rejects.toThrow('Cannot generate narrative');
    });

    it('logs but does not throw on upsert error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const supabase = createMockSupabase({
        currentTransactions: [makeTx()],
        upsertError: { message: 'unique_violation' },
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      // Should not throw — upsert failure is non-fatal
      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result).toBeDefined();
      expect(result.sections.whatHappened.length).toBeGreaterThan(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Narrative Engine] Failed to store narrative:'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });
  });

  // ── OpenAI failure fallback ────────────────────────────────────────────

  describe('OpenAI failure fallback', () => {
    it('produces fallback narrative when OpenAI call throws', async () => {
      const currentTxns = [
        makeTx({ amount: 200, category_ai: 'Software' }),
        makeTx({ amount: -500 }),
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockRejectedValue(new Error('Rate limit exceeded'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      // Fallback sections should be populated with raw data
      expect(result.sections.whatHappened.length).toBeGreaterThan(0);
      expect(result.sections.whatHappened[0]).toContain('2 transactions');
      expect(result.sections.whyItHappened.length).toBeGreaterThan(0);
      expect(result.sections.whatChanged.length).toBeGreaterThan(0);
      expect(result.sections.requiresAttention.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it('produces fallback warning for negative net income', async () => {
      const currentTxns = [
        makeTx({ amount: 1000 }),   // expense
        makeTx({ amount: -200 }),   // income — net = -800
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockRejectedValue(new Error('timeout'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      // Fallback should warn about negative income
      expect(result.sections.requiresAttention[0]).toContain('negative');

      consoleSpy.mockRestore();
    });

    it('produces no-concern fallback for positive net income', async () => {
      const currentTxns = [
        makeTx({ amount: 200 }),     // expense
        makeTx({ amount: -1000 }),   // income — net = 800
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockRejectedValue(new Error('timeout'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.sections.requiresAttention[0]).toContain('No immediate concerns');

      consoleSpy.mockRestore();
    });

    it('handles empty content from OpenAI (falls back)', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [makeTx()],
      });
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      // Should produce fallback sections
      expect(result.sections.whatHappened.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it('handles malformed JSON from OpenAI (falls back)', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [makeTx()],
      });
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'not valid json {{{' } }],
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      // Should produce fallback sections instead of crashing
      expect(result.sections.whatHappened.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it('handles empty choices array from OpenAI (falls back)', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [makeTx()],
      });
      mockCreate.mockResolvedValue({ choices: [] });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.sections.whatHappened.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it('fallback reports new vendors count correctly', async () => {
      const currentTxns = [
        makeTx({ merchant_name: 'NewVendor', amount: 100 }),
      ];
      const supabase = createMockSupabase({
        currentTransactions: currentTxns,
        previousTransactions: [], // no previous vendors
      });
      mockCreate.mockRejectedValue(new Error('fail'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.sections.whatChanged[0]).toContain('1 new vendor');

      consoleSpy.mockRestore();
    });
  });

  // ── Category breakdown ─────────────────────────────────────────────────

  describe('category breakdown', () => {
    it('builds topCategories sorted by amount descending', async () => {
      const currentTxns = [
        makeTx({ amount: 500, category_ai: 'Rent' }),
        makeTx({ amount: 100, category_ai: 'Office Supplies' }),
        makeTx({ amount: 300, category_ai: 'Software' }),
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.topCategories[0].name).toBe('Rent');
      expect(result.topCategories[0].amount).toBe(500);
      expect(result.topCategories[1].name).toBe('Software');
      expect(result.topCategories[1].amount).toBe(300);
      expect(result.topCategories[2].name).toBe('Office Supplies');
      expect(result.topCategories[2].amount).toBe(100);
    });

    it('limits topCategories to 5 entries', async () => {
      const categories = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      const currentTxns = categories.map((cat, i) =>
        makeTx({ amount: (i + 1) * 50, category_ai: cat })
      );
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.topCategories.length).toBeLessThanOrEqual(5);
    });

    it('only tracks expenses (positive amounts) in category breakdown', async () => {
      const currentTxns = [
        makeTx({ amount: 200, category_ai: 'Software' }),    // expense — should be tracked
        makeTx({ amount: -500, category_ai: 'Revenue' }),     // income — should be excluded
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      const categoryNames = result.topCategories.map(c => c.name);
      expect(categoryNames).toContain('Software');
      expect(categoryNames).not.toContain('Revenue');
    });

    it('uses category_human over category_ai when available', async () => {
      const currentTxns = [
        makeTx({ amount: 200, category_ai: 'AI Category', category_human: 'Human Category' }),
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.topCategories[0].name).toBe('Human Category');
    });

    it('falls back to Uncategorized when both category fields are null', async () => {
      const currentTxns = [
        makeTx({ amount: 200, category_ai: null, category_human: null }),
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.topCategories[0].name).toBe('Uncategorized');
    });

    it('computes change percentage for categories', async () => {
      const currentTxns = [
        makeTx({ amount: 200, category_ai: 'Software' }),
      ];
      const previousTxns = [
        makeTx({ amount: 100, category_ai: 'Software', date: '2025-05-15' }),
      ];
      const supabase = createMockSupabase({
        currentTransactions: currentTxns,
        previousTransactions: previousTxns,
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      const softwareCat = result.topCategories.find(c => c.name === 'Software');
      expect(softwareCat).toBeDefined();
      // 200 vs 100 = 100% increase
      expect(softwareCat!.change).toBe(100);
    });

    it('marks new categories as +100% change', async () => {
      const currentTxns = [
        makeTx({ amount: 300, category_ai: 'NewCategory' }),
      ];
      const previousTxns: MockTransaction[] = [];
      const supabase = createMockSupabase({
        currentTransactions: currentTxns,
        previousTransactions: previousTxns,
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      const newCat = result.topCategories.find(c => c.name === 'NewCategory');
      expect(newCat).toBeDefined();
      expect(newCat!.change).toBe(100);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles very long merchant names', async () => {
      const longName = 'A'.repeat(500);
      const currentTxns = [
        makeTx({ merchant_name: longName, amount: 100 }),
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result).toBeDefined();
      expect(result.summary.totalExpenses).toBe(100);
    });

    it('handles special characters in merchant names', async () => {
      const currentTxns = [
        makeTx({ merchant_name: 'Café ☕ — $pecial & "Chars" <div>test</div>', amount: 50 }),
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result).toBeDefined();
      expect(result.summary.totalExpenses).toBe(50);
    });

    it('handles null merchant_name and merchant_raw — defaults to Unknown', async () => {
      const currentTxns = [
        makeTx({ merchant_name: null, merchant_raw: null, amount: 75 }),
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result).toBeDefined();
      expect(result.summary.totalExpenses).toBe(75);
    });

    it('handles single transaction', async () => {
      const currentTxns = [makeTx({ amount: 42.50 })];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.totalExpenses).toBe(42.50);
      expect(result.summary.totalRevenue).toBe(0);
    });

    it('handles zero-amount transactions', async () => {
      const currentTxns = [makeTx({ amount: 0 })];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.totalRevenue).toBe(0);
      expect(result.summary.totalExpenses).toBe(0);
    });
  });

  // ── Sign convention ────────────────────────────────────────────────────

  describe('Plaid sign convention', () => {
    it('positive amounts are treated as expenses', async () => {
      const currentTxns = [
        makeTx({ amount: 100 }),
        makeTx({ amount: 200 }),
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.totalExpenses).toBe(300);
      expect(result.summary.totalRevenue).toBe(0);
    });

    it('negative amounts are treated as income/revenue', async () => {
      const currentTxns = [
        makeTx({ amount: -500 }),
        makeTx({ amount: -300 }),
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.totalRevenue).toBe(800);
      expect(result.summary.totalExpenses).toBe(0);
    });

    it('net income = revenue - expenses', async () => {
      const currentTxns = [
        makeTx({ amount: 300 }),    // expense
        makeTx({ amount: -1000 }),  // revenue
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.netIncome).toBe(700);
    });
  });

  // ── Change percent edge cases ──────────────────────────────────────────

  describe('change percent calculation', () => {
    it('returns 100 when previous is 0 and current is positive', async () => {
      const currentTxns = [makeTx({ amount: -500 })]; // revenue = 500
      const previousTxns: MockTransaction[] = [];      // revenue = 0

      const supabase = createMockSupabase({
        currentTransactions: currentTxns,
        previousTransactions: previousTxns,
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.revenueChange).toBe(100);
    });

    it('returns 0 when both periods are 0', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [],
        previousTransactions: [],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(result.summary.revenueChange).toBe(0);
      expect(result.summary.expenseChange).toBe(0);
    });
  });

  // ── OpenAI call verification ───────────────────────────────────────────

  describe('OpenAI call', () => {
    it('sends system and user messages to OpenAI', async () => {
      const supabase = createMockSupabase({
        currentTransactions: [makeTx()],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[1].role).toBe('user');
      expect(callArgs.response_format).toBeDefined();
    });

    it('uses OPENAI_MODEL env var when set', async () => {
      process.env.OPENAI_MODEL = 'gpt-4o-mini';
      // Need to re-import since singleton resets
      vi.resetModules();
      const mod = await import('../narrative');
      generateMonthlyNarrative = mod.generateMonthlyNarrative;

      const supabase = createMockSupabase({
        currentTransactions: [makeTx()],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('gpt-4o-mini');
    });

    it('defaults to gpt-4o when OPENAI_MODEL is not set', async () => {
      delete process.env.OPENAI_MODEL;
      vi.resetModules();
      const mod = await import('../narrative');
      generateMonthlyNarrative = mod.generateMonthlyNarrative;

      const supabase = createMockSupabase({
        currentTransactions: [makeTx()],
      });
      mockCreate.mockResolvedValue(OPENAI_NARRATIVE_RESPONSE);

      await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('gpt-4o');
    });
  });

  // ── Recurring vs one-time expenses ─────────────────────────────────────

  describe('recurring vs one-time expense classification', () => {
    it('classifies vendors appearing 2+ times as recurring', async () => {
      const currentTxns = [
        makeTx({ merchant_name: 'Netflix', amount: 15 }),
        makeTx({ merchant_name: 'Netflix', amount: 15 }),
        makeTx({ merchant_name: 'One-off Store', amount: 50 }),
      ];
      const supabase = createMockSupabase({ currentTransactions: currentTxns });
      mockCreate.mockRejectedValue(new Error('skip'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      // Total expenses = 80, recurring = 30 (Netflix 2x), one-time = 50
      expect(result.summary.totalExpenses).toBe(80);

      consoleSpy.mockRestore();
    });
  });

  // ── New vendor detection ───────────────────────────────────────────────

  describe('new vendor detection', () => {
    it('detects vendors in current month not in previous month', async () => {
      const currentTxns = [
        makeTx({ merchant_name: 'ExistingVendor', amount: 100 }),
        makeTx({ merchant_name: 'BrandNewVendor', amount: 200 }),
      ];
      const previousTxns = [
        makeTx({ merchant_name: 'ExistingVendor', amount: 100, date: '2025-05-15' }),
      ];
      const supabase = createMockSupabase({
        currentTransactions: currentTxns,
        previousTransactions: previousTxns,
      });
      mockCreate.mockRejectedValue(new Error('skip'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      // Fallback should mention 1 new vendor
      expect(result.sections.whatChanged[0]).toContain('1 new vendor');

      consoleSpy.mockRestore();
    });

    it('excludes Unknown vendor from new vendor list', async () => {
      const currentTxns = [
        makeTx({ merchant_name: null, merchant_raw: null, amount: 100 }),
      ];
      const supabase = createMockSupabase({
        currentTransactions: currentTxns,
        previousTransactions: [],
      });
      mockCreate.mockRejectedValue(new Error('skip'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateMonthlyNarrative('entity-1', 2025, 6, supabase);

      // "Unknown" should be excluded from new vendors
      expect(result.sections.whatChanged[0]).toContain('No new vendors');

      consoleSpy.mockRestore();
    });
  });
});
