import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  search,
  searchTransactions,
  searchVendors,
  searchCategories,
  buildSearchUrl,
  type SearchDB,
} from '@/lib/search/engine';

// ─── Mock Logger ────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createMockDB(data: Record<string, unknown>[] = []): SearchDB {
  const limitFn = vi.fn().mockResolvedValue({ data, error: null });
  const isFn = vi.fn().mockReturnValue({ limit: limitFn, in: vi.fn().mockReturnValue({ limit: limitFn }) });
  const inFn = vi.fn().mockReturnValue({ limit: limitFn, is: isFn, eq: vi.fn().mockReturnValue({ limit: limitFn }) });
  const eqFn = vi.fn().mockReturnValue({ limit: limitFn, in: inFn, is: isFn });
  const ilikeFn = vi.fn().mockReturnValue({ limit: limitFn, is: isFn, in: inFn, eq: eqFn });
  const selectFn = vi.fn().mockReturnValue({ ilike: ilikeFn, in: inFn, eq: eqFn, is: isFn, limit: limitFn });

  return {
    from: vi.fn().mockReturnValue({ select: selectFn }),
  };
}

function createErrorDB(): SearchDB {
  const limitFn = vi.fn().mockResolvedValue({ data: null, error: new Error('Query failed') });
  const isFn = vi.fn().mockReturnValue({ limit: limitFn, in: vi.fn().mockReturnValue({ limit: limitFn }) });
  const inFn = vi.fn().mockReturnValue({ limit: limitFn, is: isFn });
  const eqFn = vi.fn().mockReturnValue({ limit: limitFn, in: inFn, is: isFn });
  const ilikeFn = vi.fn().mockReturnValue({ limit: limitFn, is: isFn, in: inFn, eq: eqFn });
  const selectFn = vi.fn().mockReturnValue({ ilike: ilikeFn, in: inFn, eq: eqFn, is: isFn, limit: limitFn });

  return {
    from: vi.fn().mockReturnValue({ select: selectFn }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Search Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── buildSearchUrl ────────────────────────────────────────────────────

  describe('buildSearchUrl', () => {
    it('should build transaction URL', () => {
      const url = buildSearchUrl('transaction', 'txn-123');
      expect(url).toBe('/transactions?highlight=txn-123');
    });

    it('should build vendor URL', () => {
      const url = buildSearchUrl('vendor', 'v-456');
      expect(url).toBe('/vendors/v-456');
    });

    it('should build category URL', () => {
      const url = buildSearchUrl('category', 'cat-789');
      expect(url).toBe('/settings/categories?highlight=cat-789');
    });
  });

  // ── search ────────────────────────────────────────────────────────────

  describe('search', () => {
    it('should return empty array for empty query', async () => {
      const db = createMockDB();
      const results = await search(db, 'org-1', { query: '' });
      expect(results).toEqual([]);
    });

    it('should return empty array for single-char query', async () => {
      const db = createMockDB();
      const results = await search(db, 'org-1', { query: 'a' });
      expect(results).toEqual([]);
    });

    it('should search across all types by default', async () => {
      const db = createMockDB();
      await search(db, 'org-1', { query: 'test query' });
      // from() should have been called for transactions, vendors, categories
      expect(db.from).toHaveBeenCalledWith('transactions');
      expect(db.from).toHaveBeenCalledWith('vendors');
      expect(db.from).toHaveBeenCalledWith('categories');
    });

    it('should search only specified types', async () => {
      const db = createMockDB();
      await search(db, 'org-1', { query: 'test', types: ['vendor'] });
      expect(db.from).toHaveBeenCalledWith('vendors');
      expect(db.from).not.toHaveBeenCalledWith('transactions');
      expect(db.from).not.toHaveBeenCalledWith('categories');
    });

    it('should limit results to the specified limit', async () => {
      const manyResults = Array.from({ length: 30 }, (_, i) => ({
        id: `id-${i}`,
        name: `Item ${i}`,
        category: 'test',
      }));
      const db = createMockDB(manyResults);
      const results = await search(db, 'org-1', { query: 'test', limit: 5, types: ['vendor'] });
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  // ── searchTransactions ────────────────────────────────────────────────

  describe('searchTransactions', () => {
    it('should return mapped transaction results', async () => {
      const rows = [
        { id: 'txn-1', merchant_name: 'Starbucks', notes: null, amount: 4.50, date: '2025-01-15' },
      ];
      const db = createMockDB(rows);

      const results = await searchTransactions(db, ['ent-1'], 'Starbucks', 10);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('transaction');
      expect(results[0].title).toBe('Starbucks');
      expect(results[0].url).toContain('/transactions?highlight=txn-1');
    });

    it('should handle DB errors gracefully', async () => {
      const db = createErrorDB();
      const results = await searchTransactions(db, [], 'fail', 10);
      expect(results).toEqual([]);
    });
  });

  // ── searchVendors ─────────────────────────────────────────────────────

  describe('searchVendors', () => {
    it('should return mapped vendor results', async () => {
      const rows = [
        { id: 'v-1', name: 'Acme Corp', category: 'Services' },
      ];
      const db = createMockDB(rows);

      const results = await searchVendors(db, 'org-1', 'Acme', 10);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('vendor');
      expect(results[0].title).toBe('Acme Corp');
      expect(results[0].url).toBe('/vendors/v-1');
    });
  });

  // ── searchCategories ──────────────────────────────────────────────────

  describe('searchCategories', () => {
    it('should return mapped category results', async () => {
      const rows = [
        { id: 'cat-1', name: 'Office Supplies', code: 'OFF-001' },
      ];
      const db = createMockDB(rows);

      const results = await searchCategories(db, ['ent-1'], 'Office', 10);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('category');
      expect(results[0].title).toBe('Office Supplies');
      expect(results[0].subtitle).toBe('Code: OFF-001');
    });
  });
});
