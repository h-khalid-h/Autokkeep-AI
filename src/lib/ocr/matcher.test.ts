import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Fluent chain builder for Supabase query mocks
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);

  // Thenable
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

import { matchReceiptToTransaction } from './matcher';
import type { ExtractedReceiptData } from './extractor';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const db = mockDb as unknown as SupabaseQueryClient;

// ─── Helpers ────────────────────────────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0];

function makeExtractedData(
  overrides: Partial<ExtractedReceiptData> = {},
): ExtractedReceiptData {
  return {
    vendor: 'Starbucks',
    amount: 25.5,
    date: today,
    tax: 2.0,
    currency: 'USD',
    lineItems: [],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('matchReceiptToTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns high confidence match for exact vendor/amount/date', async () => {
    const chain = createChainMock({
      data: [
        {
          id: 'tx-1',
          merchant_name: 'Starbucks',
          amount: 25.5,
          date: today,
        },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await matchReceiptToTransaction(
      db,
      'entity-1',
      makeExtractedData(),
    );

    expect(result).not.toBeNull();
    expect(result!.transactionId).toBe('tx-1');
    // Exact match across all dimensions → confidence should be very high
    expect(result!.confidence).toBeGreaterThan(0.9);
  });

  it('returns a match above threshold for partial vendor similarity', async () => {
    const chain = createChainMock({
      data: [
        {
          id: 'tx-2',
          merchant_name: 'STARBUCKS #12345',
          amount: 25.5,
          date: today,
        },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await matchReceiptToTransaction(
      db,
      'entity-1',
      makeExtractedData({ vendor: 'Starbucks' }),
    );

    expect(result).not.toBeNull();
    expect(result!.transactionId).toBe('tx-2');
    expect(result!.confidence).toBeGreaterThan(0.6);
  });

  it('returns null when confidence is below 0.6', async () => {
    const chain = createChainMock({
      data: [
        {
          id: 'tx-3',
          merchant_name: 'COMPLETELY DIFFERENT MERCHANT',
          amount: 999.99,
          date: '2020-01-01',
        },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await matchReceiptToTransaction(
      db,
      'entity-1',
      makeExtractedData({ vendor: 'Starbucks', amount: 25.5 }),
    );

    expect(result).toBeNull();
  });

  it('returns null when transactions list is empty', async () => {
    const chain = createChainMock({ data: [], error: null });
    mockDb.from.mockReturnValue(chain);

    const result = await matchReceiptToTransaction(
      db,
      'entity-1',
      makeExtractedData(),
    );

    expect(result).toBeNull();
  });

  it('returns null when transactions query returns null data', async () => {
    const chain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(chain);

    const result = await matchReceiptToTransaction(
      db,
      'entity-1',
      makeExtractedData(),
    );

    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    const chain = createChainMock({
      data: null,
      error: { message: 'query failed' },
    });
    mockDb.from.mockReturnValue(chain);

    const result = await matchReceiptToTransaction(
      db,
      'entity-1',
      makeExtractedData(),
    );

    expect(result).toBeNull();
  });

  it('selects the best match when multiple transactions exist', async () => {
    const chain = createChainMock({
      data: [
        {
          id: 'tx-low',
          merchant_name: 'Target',
          amount: 100.0,
          date: '2025-12-01',
        },
        {
          id: 'tx-high',
          merchant_name: 'Starbucks',
          amount: 25.5,
          date: today,
        },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await matchReceiptToTransaction(
      db,
      'entity-1',
      makeExtractedData(),
    );

    expect(result).not.toBeNull();
    expect(result!.transactionId).toBe('tx-high');
  });
});
