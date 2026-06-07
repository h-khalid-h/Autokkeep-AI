import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateFXGainLoss } from './fx-gain-loss';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ─── Mock the FX rate provider ──────────────────────────────────────────────────

vi.mock('./fx-rates', () => ({
  fxRateProvider: {
    getRate: vi.fn(),
    getRates: vi.fn(),
  },
}));

import { fxRateProvider } from './fx-rates';
const mockGetRates = vi.mocked(fxRateProvider.getRates);

// ─── Mock Supabase ──────────────────────────────────────────────────────────────

function createMockDb(
  entity: { name: string; base_currency: string } | null,
  transactions: Array<{ currency: string; amount: number; exchange_rate: number }> | null,
  entityError?: { message: string },
  txError?: { message: string }
): SupabaseQueryClient {
  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === 'entities') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: entity,
                error: entityError || null,
              }),
          }),
        }),
      };
    }
    if (table === 'transactions') {
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              neq: () => ({
                is: () =>
                  Promise.resolve({
                    data: transactions,
                    error: txError ? txError : null,
                  }),
              }),
            }),
          }),
        }),
      };
    }
    return {};
  });

  return { from: mockFrom } as unknown as SupabaseQueryClient;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('calculateFXGainLoss', () => {
  it('calculates gain when foreign currency appreciates', async () => {
    // Entity: base = USD. Transaction: 1000 EUR at rate 1.08 (1 EUR = 1.08 USD)
    // Current rate: 1 USD = 0.90 EUR → 1 EUR = 1/0.90 = 1.11 USD
    const db = createMockDb(
      { name: 'Test Corp', base_currency: 'USD' },
      [{ currency: 'EUR', amount: 1000, exchange_rate: 1.08 }]
    );

    mockGetRates.mockResolvedValueOnce([
      { from: 'USD', to: 'EUR', rate: 0.90, timestamp: '2024-01-01T00:00:00Z', source: 'fallback' },
    ]);

    const result = await calculateFXGainLoss(db, 'entity-1');

    expect(result.entityId).toBe('entity-1');
    expect(result.entityName).toBe('Test Corp');
    expect(result.baseCurrency).toBe('USD');
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item.foreignCurrency).toBe('EUR');
    expect(item.originalAmount).toBe(1000);
    expect(item.originalRate).toBe(1.08);
    // currentRate = 1/0.90 ≈ 1.11
    expect(item.currentRate).toBeCloseTo(1.11, 1);
    // baseAmountAtOriginal = 1000 * 1.08 = 1080
    expect(item.baseAmountAtOriginal).toBe(1080);
    // baseAmountAtCurrent = 1000 * 1.11 = 1111.11 (approx)
    expect(item.baseAmountAtCurrent).toBeGreaterThan(1080);
    // Gain because EUR appreciated
    expect(item.unrealizedGainLoss).toBeGreaterThan(0);
    expect(result.totalUnrealizedGainLoss).toBeGreaterThan(0);
  });

  it('calculates loss when foreign currency depreciates', async () => {
    // Entity: base = USD. Transaction: 500 GBP at rate 1.30 (1 GBP = 1.30 USD)
    // Current rate: 1 USD = 0.85 GBP → 1 GBP = 1/0.85 = 1.18 USD (depreciated)
    const db = createMockDb(
      { name: 'Test Corp', base_currency: 'USD' },
      [{ currency: 'GBP', amount: 500, exchange_rate: 1.30 }]
    );

    mockGetRates.mockResolvedValueOnce([
      { from: 'USD', to: 'GBP', rate: 0.85, timestamp: '2024-01-01T00:00:00Z', source: 'fallback' },
    ]);

    const result = await calculateFXGainLoss(db, 'entity-1');

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    // currentRate = 1/0.85 ≈ 1.18 (less than original 1.30)
    expect(item.currentRate).toBeLessThan(item.originalRate);
    // Loss
    expect(item.unrealizedGainLoss).toBeLessThan(0);
    expect(result.totalUnrealizedGainLoss).toBeLessThan(0);
  });

  it('returns empty items when no foreign transactions exist', async () => {
    const db = createMockDb(
      { name: 'Local Corp', base_currency: 'USD' },
      [] // no foreign transactions
    );

    const result = await calculateFXGainLoss(db, 'entity-1');

    expect(result.items).toHaveLength(0);
    expect(result.totalUnrealizedGainLoss).toBe(0);
  });

  it('handles multiple foreign currencies', async () => {
    const db = createMockDb(
      { name: 'Multi Corp', base_currency: 'USD' },
      [
        { currency: 'EUR', amount: 1000, exchange_rate: 1.08 },
        { currency: 'GBP', amount: 500, exchange_rate: 1.25 },
        { currency: 'JPY', amount: 100000, exchange_rate: 0.0067 },
      ]
    );

    mockGetRates.mockResolvedValueOnce([
      { from: 'USD', to: 'EUR', rate: 0.92, timestamp: '2024-01-01T00:00:00Z', source: 'fallback' },
      { from: 'USD', to: 'GBP', rate: 0.79, timestamp: '2024-01-01T00:00:00Z', source: 'fallback' },
      { from: 'USD', to: 'JPY', rate: 149.5, timestamp: '2024-01-01T00:00:00Z', source: 'fallback' },
    ]);

    const result = await calculateFXGainLoss(db, 'entity-1');

    expect(result.items).toHaveLength(3);
    const currencies = result.items.map((i) => i.foreignCurrency);
    expect(currencies).toContain('EUR');
    expect(currencies).toContain('GBP');
    expect(currencies).toContain('JPY');

    // Total should be the sum of all individual gain/losses
    const expectedTotal = result.items.reduce((sum, i) => sum + i.unrealizedGainLoss, 0);
    expect(result.totalUnrealizedGainLoss).toBeCloseTo(expectedTotal, 1);
  });

  it('throws when entity is not found', async () => {
    const db = createMockDb(null, null, { message: 'Not found' });

    await expect(calculateFXGainLoss(db, 'nonexistent'))
      .rejects.toThrow('Entity not found');
  });

  it('throws when transactions query fails', async () => {
    const db = createMockDb(
      { name: 'Test Corp', base_currency: 'USD' },
      null,
      undefined,
      { message: 'DB error' }
    );

    await expect(calculateFXGainLoss(db, 'entity-1'))
      .rejects.toThrow('Failed to query transactions');
  });

  it('uses the provided asOfDate', async () => {
    const db = createMockDb(
      { name: 'Test Corp', base_currency: 'USD' },
      []
    );

    const result = await calculateFXGainLoss(db, 'entity-1', '2024-06-15');

    expect(result.asOfDate).toBe('2024-06-15');
  });

  it('defaults asOfDate to today when not provided', async () => {
    const db = createMockDb(
      { name: 'Test Corp', base_currency: 'USD' },
      []
    );

    const result = await calculateFXGainLoss(db, 'entity-1');

    const today = new Date().toISOString().slice(0, 10);
    expect(result.asOfDate).toBe(today);
  });
});
