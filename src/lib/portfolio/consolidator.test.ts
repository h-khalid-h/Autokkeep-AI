import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildConsolidatedPortfolio } from './consolidator';
import type { FXRateProvider, FXRate } from '@/lib/currency/fx-rates';

// Suppress logger output during tests
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockDb(entities: Array<{ id: string; name: string; base_currency: string }>, transactions: Record<string, Array<{ amount: number }>>) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'entities') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: entities,
              error: null,
            }),
          }),
        };
      }
      if (table === 'transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, entityId: string) => ({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: transactions[entityId] || [],
                    error: null,
                  }),
                }),
              }),
            })),
          }),
        };
      }
      return { select: vi.fn() };
    }),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
    auth: {},
  };
}

function createMockFxProvider(rates: Record<string, number>): FXRateProvider {
  return {
    getRate: vi.fn().mockImplementation(async (from: string, to: string): Promise<FXRate> => {
      const key = `${from}->${to}`;
      const rate = rates[key] ?? 1.0;
      return {
        from,
        to,
        rate,
        timestamp: new Date().toISOString(),
        source: 'fallback',
      };
    }),
    getRates: vi.fn().mockResolvedValue([]),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Portfolio Consolidator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty portfolio when org has no entities', async () => {
    const db = createMockDb([], {});
    const fxProvider = createMockFxProvider({});

    const result = await buildConsolidatedPortfolio(
      'org_1',
      'USD',
      '2026-01-31',
      { db: db as never, fxProvider }
    );

    expect(result.entities).toHaveLength(0);
    expect(result.totalConvertedAssets).toBe(0);
    expect(result.totalConvertedLiabilities).toBe(0);
    expect(result.totalConvertedNetWorth).toBe(0);
    expect(result.displayCurrency).toBe('USD');
    expect(result.asOfDate).toBe('2026-01-31');
  });

  it('computes single entity portfolio correctly', async () => {
    const entities = [
      { id: 'entity_1', name: 'US Corp', base_currency: 'USD' },
    ];
    const transactions = {
      entity_1: [
        { amount: 5000 },   // asset (positive)
        { amount: 3000 },   // asset (positive)
        { amount: -1000 },  // liability (negative)
      ],
    };

    const db = createMockDb(entities, transactions);
    const fxProvider = createMockFxProvider({});

    const result = await buildConsolidatedPortfolio(
      'org_1',
      'USD',
      '2026-01-31',
      { db: db as never, fxProvider }
    );

    expect(result.entities).toHaveLength(1);
    const entity = result.entities[0];
    expect(entity.entityName).toBe('US Corp');
    expect(entity.totalAssets).toBe(8000);
    expect(entity.totalLiabilities).toBe(1000);
    expect(entity.netWorth).toBe(7000);
    expect(entity.fxRate).toBe(1.0); // same currency
    expect(entity.convertedNetWorth).toBe(7000);
  });

  it('handles multiple entities with different currencies', async () => {
    const entities = [
      { id: 'entity_us', name: 'US Corp', base_currency: 'USD' },
      { id: 'entity_uk', name: 'UK Ltd', base_currency: 'GBP' },
    ];
    const transactions = {
      entity_us: [
        { amount: 10000 },
        { amount: -2000 },
      ],
      entity_uk: [
        { amount: 5000 },
        { amount: -1000 },
      ],
    };

    const db = createMockDb(entities, transactions);
    const fxProvider = createMockFxProvider({
      'GBP->USD': 1.27,
    });

    const result = await buildConsolidatedPortfolio(
      'org_1',
      'USD',
      '2026-01-31',
      { db: db as never, fxProvider }
    );

    expect(result.entities).toHaveLength(2);

    // US entity: no conversion needed
    const usEntity = result.entities.find(e => e.entityId === 'entity_us')!;
    expect(usEntity.totalAssets).toBe(10000);
    expect(usEntity.totalLiabilities).toBe(2000);
    expect(usEntity.netWorth).toBe(8000);
    expect(usEntity.fxRate).toBe(1.0);
    expect(usEntity.convertedNetWorth).toBe(8000);

    // UK entity: converted at 1.27
    const ukEntity = result.entities.find(e => e.entityId === 'entity_uk')!;
    expect(ukEntity.totalAssets).toBe(5000);
    expect(ukEntity.totalLiabilities).toBe(1000);
    expect(ukEntity.netWorth).toBe(4000);
    expect(ukEntity.fxRate).toBe(1.27);
    expect(ukEntity.convertedNetWorth).toBe(5080); // 4000 * 1.27

    // Portfolio totals
    // US converted assets: 10000 * 1.0 = 10000
    // UK converted assets: 5000 * 1.27 = 6350
    expect(result.totalConvertedAssets).toBe(16350);
    // US converted liabilities: 2000 * 1.0 = 2000
    // UK converted liabilities: 1000 * 1.27 = 1270
    expect(result.totalConvertedLiabilities).toBe(3270);
    expect(result.totalConvertedNetWorth).toBe(13080); // 8000 + 5080
  });

  it('applies FX conversion correctly', async () => {
    const entities = [
      { id: 'entity_ae', name: 'AE Branch', base_currency: 'AED' },
    ];
    const transactions = {
      entity_ae: [
        { amount: 36725 }, // ~10000 USD
      ],
    };

    const db = createMockDb(entities, transactions);
    const fxProvider = createMockFxProvider({
      'AED->USD': 0.2723, // 1 AED = 0.2723 USD
    });

    const result = await buildConsolidatedPortfolio(
      'org_1',
      'USD',
      '2026-01-31',
      { db: db as never, fxProvider }
    );

    const entity = result.entities[0];
    expect(entity.fxRate).toBe(0.2723);
    expect(entity.convertedNetWorth).toBe(Math.round(36725 * 0.2723 * 100) / 100);
  });

  it('handles entity with no transactions (zero values)', async () => {
    const entities = [
      { id: 'entity_new', name: 'New Corp', base_currency: 'USD' },
    ];
    const transactions = {
      entity_new: [], // no transactions
    };

    const db = createMockDb(entities, transactions);
    const fxProvider = createMockFxProvider({});

    const result = await buildConsolidatedPortfolio(
      'org_1',
      'USD',
      '2026-01-31',
      { db: db as never, fxProvider }
    );

    expect(result.entities).toHaveLength(1);
    const entity = result.entities[0];
    expect(entity.totalAssets).toBe(0);
    expect(entity.totalLiabilities).toBe(0);
    expect(entity.netWorth).toBe(0);
    expect(entity.convertedNetWorth).toBe(0);
  });

  it('throws when entity fetch fails', async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database connection failed' },
          }),
        }),
      }),
      rpc: vi.fn(),
      storage: { from: vi.fn() },
      auth: {},
    };

    const fxProvider = createMockFxProvider({});

    await expect(
      buildConsolidatedPortfolio('org_1', 'USD', '2026-01-31', {
        db: db as never,
        fxProvider,
      })
    ).rejects.toThrow('Failed to fetch entities');
  });

  it('includes correct metadata in portfolio response', async () => {
    const db = createMockDb([], {});
    const fxProvider = createMockFxProvider({});

    const result = await buildConsolidatedPortfolio(
      'org_1',
      'EUR',
      '2026-06-30',
      { db: db as never, fxProvider }
    );

    expect(result.displayCurrency).toBe('EUR');
    expect(result.asOfDate).toBe('2026-06-30');
    expect(result.generatedAt).toBeDefined();
    // generatedAt should be a valid ISO timestamp
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });
});
