import { describe, it, expect, vi } from 'vitest';
import { analyzeTaxReadiness } from './readiness';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ============================================
// Mock Supabase factory
// ============================================

interface MockTransactionRow {
  id: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  category_ai: string | null;
  category_human: string | null;
  receipt_url: string | null;
  status: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function createMockSupabase(transactions: MockTransactionRow[]) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any) => resolve({ data: transactions, error: null });

  return {
    from: vi.fn().mockReturnValue(chain),
  } as unknown as SupabaseQueryClient;
}

function createErrorMockSupabase() {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any) =>
    resolve({ data: null, error: { message: 'Query failed' } });

  return {
    from: vi.fn().mockReturnValue(chain),
  } as unknown as SupabaseQueryClient;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// Fixture helpers
// ============================================

function makeTx(overrides: Partial<MockTransactionRow> = {}): MockTransactionRow {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    merchant_name: 'Acme Corp',
    amount: -100,
    date: '2025-06-15',
    category_human: '6200',
    category_ai: 'Software',
    receipt_url: 'https://storage.example.com/receipt.pdf',
    status: 'approved',
    ...overrides,
  };
}

// ============================================
// analyzeTaxReadiness — basic behavior
// ============================================
describe('analyzeTaxReadiness', () => {
  describe('report structure', () => {
    it('returns a complete TaxReadinessReport', async () => {
      const transactions = [makeTx()];
      const db = createMockSupabase(transactions);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      expect(report.entityId).toBe('entity-1');
      expect(report.taxYear).toBe(2025);
      expect(typeof report.totalExpenses).toBe('number');
      expect(typeof report.totalDeductible).toBe('number');
      expect(typeof report.estimatedSavings).toBe('number');
      expect(Array.isArray(report.deductionsByCategory)).toBe(true);
      expect(Array.isArray(report.missingReceipts)).toBe(true);
      expect(typeof report.readinessScore).toBe('number');
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('readiness score is between 0 and 100', async () => {
      const db = createMockSupabase([makeTx()]);
      const report = await analyzeTaxReadiness('entity-1', 2025, db);
      expect(report.readinessScore).toBeGreaterThanOrEqual(0);
      expect(report.readinessScore).toBeLessThanOrEqual(100);
    });
  });

  describe('empty transactions', () => {
    it('returns perfect readiness score with no transactions', async () => {
      const db = createMockSupabase([]);
      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      expect(report.totalExpenses).toBe(0);
      expect(report.totalDeductible).toBe(0);
      expect(report.estimatedSavings).toBe(0);
      expect(report.deductionsByCategory).toHaveLength(0);
      expect(report.missingReceipts).toHaveLength(0);
      expect(report.readinessScore).toBe(100);
    });
  });

  describe('GL code-based categorization', () => {
    it('categorizes Software & Technology by GL prefix 6200', async () => {
      const tx = makeTx({ category_human: '6200', amount: -500 });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      const softwareCat = report.deductionsByCategory.find(
        (c) => c.category === 'Software & Technology'
      );
      expect(softwareCat).toBeDefined();
      expect(softwareCat!.amount).toBe(500);
    });

    it('categorizes Office Supplies by GL prefix 6100', async () => {
      const tx = makeTx({ category_human: '6100', category_ai: 'Supplies', amount: -75 });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      const officeCat = report.deductionsByCategory.find(
        (c) => c.category === 'Office Supplies'
      );
      expect(officeCat).toBeDefined();
      expect(officeCat!.amount).toBe(75);
    });

    it('categorizes Travel by GL prefix 6300', async () => {
      const tx = makeTx({ category_human: '6310', amount: -1200 });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      const travelCat = report.deductionsByCategory.find(
        (c) => c.category === 'Travel'
      );
      expect(travelCat).toBeDefined();
    });

    it('categorizes Personal/Non-Deductible by GL prefix 9000', async () => {
      const tx = makeTx({ category_human: '9000', amount: -200 });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      // Non-deductible should NOT appear in deductionsByCategory
      const personalCat = report.deductionsByCategory.find(
        (c) => c.category === 'Personal / Non-Deductible'
      );
      expect(personalCat).toBeUndefined();
    });
  });

  describe('keyword-based categorization fallback', () => {
    it('uses merchant name keyword when GL code is missing', async () => {
      const tx = makeTx({
        category_human: null,
        category_ai: null,
        merchant_name: 'Google Cloud Platform',
        amount: -350,
      });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      // "google" keyword maps to Software & Technology
      const softwareCat = report.deductionsByCategory.find(
        (c) => c.category === 'Software & Technology'
      );
      expect(softwareCat).toBeDefined();
    });

    it('categorizes restaurant spending via keyword', async () => {
      const tx = makeTx({
        category_human: null,
        category_ai: null,
        merchant_name: 'Restaurant La Piazza',
        amount: -85,
      });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      const mealsCat = report.deductionsByCategory.find(
        (c) => c.category === 'Meals & Entertainment'
      );
      expect(mealsCat).toBeDefined();
    });

    it('defaults to Other Business Expenses when no match', async () => {
      const tx = makeTx({
        category_human: null,
        category_ai: null,
        merchant_name: 'XYZ Completely Unknown',
        amount: -50,
      });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      const otherCat = report.deductionsByCategory.find(
        (c) => c.category === 'Other Business Expenses'
      );
      expect(otherCat).toBeDefined();
    });
  });

  describe('missing receipt detection', () => {
    it('detects missing receipts for deductible expenses >= $25', async () => {
      const tx = makeTx({
        receipt_url: null,
        amount: -100,
        category_human: '6200',
      });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      expect(report.missingReceipts.length).toBe(1);
      expect(report.missingReceipts[0].amount).toBe(100);
    });

    it('does not flag missing receipts for expenses under $25', async () => {
      const tx = makeTx({
        receipt_url: null,
        amount: -15,
        category_human: '6200',
      });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      expect(report.missingReceipts.length).toBe(0);
    });

    it('does not flag expenses that have receipts', async () => {
      const tx = makeTx({
        receipt_url: 'https://storage.example.com/receipt.pdf',
        amount: -500,
        category_human: '6200',
      });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      expect(report.missingReceipts.length).toBe(0);
    });

    it('caps missing receipts at 50 entries', async () => {
      const transactions = Array.from({ length: 60 }, (_, i) =>
        makeTx({
          id: `tx-${i}`,
          receipt_url: null,
          amount: -100,
          category_human: '6200',
        })
      );
      const db = createMockSupabase(transactions);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      expect(report.missingReceipts.length).toBeLessThanOrEqual(50);
    });
  });

  describe('estimated savings', () => {
    it('calculates estimated savings at default 25% tax rate', async () => {
      const tx = makeTx({ amount: -1000, category_human: '6200' });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      // $1000 deductible * 0.25 = $250
      expect(report.estimatedSavings).toBe(250);
    });

    it('calculates estimated savings at custom tax rate', async () => {
      const tx = makeTx({ amount: -1000, category_human: '6200' });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db, 0.30);

      // $1000 deductible * 0.30 = $300
      expect(report.estimatedSavings).toBe(300);
    });

    it('non-deductible expenses do not contribute to savings', async () => {
      const tx = makeTx({ amount: -1000, category_human: '9000' }); // Personal / Non-Deductible
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      expect(report.estimatedSavings).toBe(0);
    });
  });

  describe('readiness score computation', () => {
    it('gives high score when all receipts are present and categorized', async () => {
      const transactions = Array.from({ length: 50 }, (_, i) =>
        makeTx({
          id: `tx-${i}`,
          receipt_url: 'https://storage.example.com/receipt.pdf',
          category_human: '6200',
          amount: -100,
        })
      );
      const db = createMockSupabase(transactions);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      expect(report.readinessScore).toBeGreaterThanOrEqual(90);
    });

    it('penalizes missing receipts', async () => {
      const withReceipts = Array.from({ length: 25 }, (_, i) =>
        makeTx({
          id: `tx-with-${i}`,
          receipt_url: 'https://example.com/receipt.pdf',
          category_human: '6200',
          amount: -100,
        })
      );
      const withoutReceipts = Array.from({ length: 25 }, (_, i) =>
        makeTx({
          id: `tx-without-${i}`,
          receipt_url: null,
          category_human: '6200',
          amount: -100,
        })
      );
      const db = createMockSupabase([...withReceipts, ...withoutReceipts]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      // 50% receipt compliance → significant score reduction
      expect(report.readinessScore).toBeLessThan(90);
    });

    it('penalizes uncategorized transactions (no GL code)', async () => {
      const transactions = Array.from({ length: 50 }, (_, i) =>
        makeTx({
          id: `tx-${i}`,
          receipt_url: 'https://example.com/receipt.pdf',
          category_human: null,
          category_ai: null,
          merchant_name: 'Unknown',
          amount: -100,
        })
      );
      const db = createMockSupabase(transactions);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      // No GL codes → categorization coverage is 0% → 20pt penalty
      expect(report.readinessScore).toBeLessThan(90);
    });
  });

  describe('recommendations', () => {
    it('recommends uploading missing receipts', async () => {
      const tx = makeTx({ receipt_url: null, amount: -100, category_human: '6200' });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      const receiptRec = report.recommendations.find((r) =>
        r.includes('missing receipt')
      );
      expect(receiptRec).toBeDefined();
    });

    it('includes score-based recommendation for high scores', async () => {
      const transactions = Array.from({ length: 50 }, (_, i) =>
        makeTx({
          id: `tx-${i}`,
          receipt_url: 'https://example.com/receipt.pdf',
          category_human: '6200',
          amount: -100,
        })
      );
      const db = createMockSupabase(transactions);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      if (report.readinessScore >= 90) {
        const excellentRec = report.recommendations.find((r) =>
          r.includes('excellent')
        );
        expect(excellentRec).toBeDefined();
      }
    });

    it('suggests home office deduction when no rent expenses', async () => {
      const tx = makeTx({ category_human: '6200', amount: -100 });
      const db = createMockSupabase([tx]);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      const homeOfficeRec = report.recommendations.find((r) =>
        r.includes('home office')
      );
      expect(homeOfficeRec).toBeDefined();
    });
  });

  describe('deductions by category', () => {
    it('sorts categories by amount descending', async () => {
      const transactions = [
        makeTx({ category_human: '6200', amount: -500 }),  // Software
        makeTx({ category_human: '6300', amount: -1200 }), // Travel
        makeTx({ category_human: '6100', amount: -75 }),    // Office Supplies
      ];
      const db = createMockSupabase(transactions);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      const amounts = report.deductionsByCategory.map((c) => c.amount);
      for (let i = 1; i < amounts.length; i++) {
        expect(amounts[i]).toBeLessThanOrEqual(amounts[i - 1]);
      }
    });

    it('counts transactions per category', async () => {
      const transactions = [
        makeTx({ category_human: '6200', amount: -100 }),
        makeTx({ category_human: '6200', amount: -200 }),
        makeTx({ category_human: '6200', amount: -300 }),
      ];
      const db = createMockSupabase(transactions);

      const report = await analyzeTaxReadiness('entity-1', 2025, db);

      const softwareCat = report.deductionsByCategory.find(
        (c) => c.category === 'Software & Technology'
      );
      expect(softwareCat).toBeDefined();
      expect(softwareCat!.count).toBe(3);
      expect(softwareCat!.amount).toBe(600);
    });
  });

  describe('error handling', () => {
    it('throws when database query fails', async () => {
      const db = createErrorMockSupabase();
      await expect(
        analyzeTaxReadiness('entity-1', 2025, db)
      ).rejects.toThrow('Failed to fetch transactions');
    });
  });
});
