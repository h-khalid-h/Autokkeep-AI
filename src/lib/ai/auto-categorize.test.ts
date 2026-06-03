import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock dependencies ─────────────────────────────────────────────────────────
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockDb),
}));

vi.mock('@/lib/ai/categorizer', () => ({
  batchCategorize: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(),
}));

const mockFrom = vi.fn();
const mockDb = { from: mockFrom };

// Fluent chain builder that properly supports Supabase query patterns
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  // Terminal — when awaited, resolves
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

import { runAutoCategorize } from './auto-categorize';
import { batchCategorize } from './categorizer';

describe('runAutoCategorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zeros when no pending transactions', async () => {
    const txChain = createChainMock({ data: [], error: null });
    mockFrom.mockReturnValue(txChain);

    const result = await runAutoCategorize({ supabase: mockDb as never });

    expect(result.processed).toBe(0);
    expect(result.auto_categorized).toBe(0);
    expect(result.human_review).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.entity_ids).toEqual([]);
  });

  it('categorizes transactions and returns counts', async () => {
    const pendingTxs = [
      { id: 'tx-1', entity_id: 'ent-1', merchant_name: 'Starbucks', amount: 4.50, date: '2025-01-01', mcc_code: '5812', currency: 'USD' },
      { id: 'tx-2', entity_id: 'ent-1', merchant_name: 'Amazon', amount: 100.00, date: '2025-01-02', currency: 'USD' },
    ];

    const txChain = createChainMock({ data: pendingTxs, error: null });
    const rulesChain = createChainMock({ data: [], error: null });
    const chartChain = createChainMock({ data: [{ code: '5020', name: 'Office Supplies' }], error: null });
    const historyChain = createChainMock({ data: [], error: null });
    const updateChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'transactions' && callCount === 0) {
        callCount++;
        return txChain;
      }
      if (table === 'categorization_rules') return rulesChain;
      if (table === 'chart_of_accounts') return chartChain;
      if (table === 'categorization_history') return historyChain;
      return updateChain;
    });

    // Mock batch categorize response
    const mockResults = new Map([
      ['tx-1', { glCode: '5020', glName: 'Office Supplies', confidence: 95, reasoning: 'match', engine: 'deterministic' as const, ruleMatchType: 'exact_match' as const, sourceHash: 'abc', alternatives: [] }],
      ['tx-2', { glCode: '5020', glName: 'Office Supplies', confidence: 60, reasoning: 'low', engine: 'probabilistic' as const, ruleMatchType: 'none' as const, sourceHash: 'def', alternatives: [] }],
    ]);
    vi.mocked(batchCategorize).mockResolvedValue(mockResults);

    const result = await runAutoCategorize({ supabase: mockDb as never });

    expect(result.processed).toBe(2);
    // Composite confidence gate (C_s = 0.5*P_llm + 0.3*S_rule + 0.2*M_doc):
    // tx-1: C_s = 0.5*0.95 + 0.3*1.0 + 0.2*0 = 0.775 < 0.95 → human_review
    // tx-2: C_s = 0.5*0.60 + 0.3*0.0 + 0.2*0 = 0.300 < 0.95 → human_review
    // Without document corroboration (M_doc=0), max composite is 0.80 — by design, all
    // batch-categorized transactions route to human_review for receipt verification.
    expect(result.auto_categorized).toBe(0);
    expect(result.human_review).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.entity_ids).toEqual(['ent-1']);
    expect(batchCategorize).toHaveBeenCalledOnce();
  });

  it('counts failed categorizations correctly', async () => {
    const pendingTxs = [
      { id: 'tx-1', entity_id: 'ent-1', merchant_name: 'Unknown', amount: 0, date: '2025-01-01', currency: 'USD' },
    ];

    const txChain = createChainMock({ data: pendingTxs, error: null });
    const emptyChain = createChainMock({ data: [], error: null });
    const updateChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'transactions' && callCount === 0) {
        callCount++;
        return txChain;
      }
      if (table === 'categorization_rules' || table === 'chart_of_accounts' || table === 'categorization_history') return emptyChain;
      return updateChain;
    });

    const mockResults = new Map([
      ['tx-1', { glCode: '', glName: '', confidence: 0, reasoning: 'no match', engine: 'probabilistic' as const, ruleMatchType: 'none' as const, sourceHash: '', alternatives: [] }],
    ]);
    vi.mocked(batchCategorize).mockResolvedValue(mockResults);

    const result = await runAutoCategorize({ supabase: mockDb as never });

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.auto_categorized).toBe(0);
  });

  it('throws on database error', async () => {
    const errChain = createChainMock({ data: null, error: { message: 'connection failed' } });
    mockFrom.mockReturnValue(errChain);

    await expect(runAutoCategorize({ supabase: mockDb as never }))
      .rejects.toThrow('Failed to fetch uncategorized transactions');
  });
});
