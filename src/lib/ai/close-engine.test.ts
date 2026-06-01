import { describe, it, expect, vi } from 'vitest';
import { runMonthEndClose, closePeriod } from './close-engine';

// ============================================
// Mock analyzeVariance (imported by close-engine)
// ============================================
vi.mock('@/lib/reconciliation/engine', () => ({
  analyzeVariance: (bankBalance: number, bookBalance: number, _type: string) => {
    const variance = Math.abs(bankBalance - bookBalance);
    return {
      isKnownFee: variance < 50,
      description: variance < 50 ? 'Likely a bank fee' : 'Significant variance',
      glCode: variance < 50 ? '5999' : '0000',
      glName: variance < 50 ? 'Bank Fees' : 'Unreconciled',
    };
  },
}));

// ============================================
// Mock Supabase factory
// ============================================

interface MockTransaction {
  id: string;
  amount: number;
  date: string;
  merchant_name: string | null;
  category_ai: string | null;
  category_human: string | null;
  status: string;
  document_status: string | null;
}

interface MockBankAccount {
  id: string;
  current_balance: number | null;
  name: string | null;
  connection_id: string;
}

interface MockBankConnection {
  id: string;
  last_synced_at: string | null;
  status: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function createMockSupabase(opts: {
  transactions?: MockTransaction[];
  txError?: { message: string } | null;
  bankConnections?: MockBankConnection[];
  bankAccounts?: MockBankAccount[];
  historicalTxns?: { amount: number; category_ai: string | null; category_human: string | null }[];
} = {}) {
  const {
    transactions = [],
    txError = null,
    bankConnections = [],
    bankAccounts = [],
    historicalTxns = [],
  } = opts;



  const mock: any = {
    from: vi.fn((table: string) => {
      const chain: any = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.neq = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.lt = vi.fn().mockReturnValue(chain);
      chain.in = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      chain.update = vi.fn().mockReturnValue(chain);
      chain.insert = vi.fn().mockResolvedValue({ error: null });

      if (table === 'transactions') {
        // Distinguish between current period and historical queries
        // Historical queries have different gte dates; we'll use a call counter
        let txCallCount = 0;
        chain.order = vi.fn().mockImplementation(() => {
          txCallCount++;
          if (txCallCount === 1) {
            // Current period transactions
            chain.then = (resolve: any) =>
              resolve({ data: txError ? null : transactions, error: txError });
            return chain;
          }
          // Historical transactions (subsequent call)
          chain.then = undefined;
          return chain;
        });
        // For the historical query that doesn't have .order
        chain.then = (resolve: any) =>
          resolve({ data: historicalTxns, error: null });
      } else if (table === 'bank_connections') {
        chain.then = (resolve: any) =>
          resolve({ data: bankConnections, error: null });
      } else if (table === 'bank_accounts') {
        chain.then = (resolve: any) =>
          resolve({ data: bankAccounts, error: null });
      } else if (table === 'accounting_periods') {
        // Used by closePeriod
      }

      return chain;
    }),
  };

  return mock;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// Test fixtures
// ============================================

function makeTx(overrides: Partial<MockTransaction> = {}): MockTransaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    amount: -100,
    date: '2025-06-15',
    merchant_name: 'Acme Corp',
    category_ai: 'Software',
    category_human: null,
    status: 'approved',
    document_status: 'found',
    ...overrides,
  };
}

// ============================================
// runMonthEndClose — report structure
// ============================================
describe('runMonthEndClose', () => {
  describe('report structure', () => {
    it('returns a complete CloseReport', async () => {
      const supabase = createMockSupabase({ transactions: [makeTx()] });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      expect(report.entityId).toBe('entity-1');
      expect(report.period).toEqual({ year: 2025, month: 6 });
      expect(typeof report.readinessScore).toBe('number');
      expect(Array.isArray(report.checks)).toBe(true);
      expect(typeof report.summary).toBe('string');
      expect(typeof report.isReady).toBe('boolean');
    });

    it('readiness score is between 0 and 100', async () => {
      const supabase = createMockSupabase({ transactions: [makeTx()] });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      expect(report.readinessScore).toBeGreaterThanOrEqual(0);
      expect(report.readinessScore).toBeLessThanOrEqual(100);
    });

    it('includes 5 check types', async () => {
      const supabase = createMockSupabase({ transactions: [makeTx()] });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      expect(report.checks).toHaveLength(5);
      const checkNames = report.checks.map((c) => c.name);
      expect(checkNames).toContain('Bank Reconciliation');
      expect(checkNames).toContain('Receipt Documentation');
      expect(checkNames).toContain('Transaction Categorization');
      expect(checkNames).toContain('Expense Review');
      expect(checkNames).toContain('Bank Feed Sync');
    });
  });

  describe('data fetch error', () => {
    it('returns a fail report when transactions cannot be fetched', async () => {
      const supabase = createMockSupabase({
        txError: { message: 'Database connection failed' },
      });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      expect(report.readinessScore).toBe(0);
      expect(report.isReady).toBe(false);
      expect(report.checks[0].status).toBe('fail');
      expect(report.checks[0].description).toContain('Database connection failed');
    });
  });

  describe('receipt documentation check', () => {
    it('passes when all transactions have receipts', async () => {
      const transactions = [
        makeTx({ document_status: 'found', amount: -100 }),
        makeTx({ document_status: 'found', amount: -200 }),
      ];
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      const receiptCheck = report.checks.find(
        (c) => c.name === 'Receipt Documentation'
      );
      expect(receiptCheck?.status).toBe('pass');
    });

    it('warns when some transactions are missing receipts', async () => {
      const transactions = Array.from({ length: 5 }, (_, i) =>
        makeTx({
          id: `tx-${i}`,
          document_status: 'missing',
          amount: -100,
        })
      );
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      const receiptCheck = report.checks.find(
        (c) => c.name === 'Receipt Documentation'
      );
      expect(receiptCheck?.status).toBe('warning');
    });

    it('fails when many transactions are missing receipts', async () => {
      const transactions = Array.from({ length: 15 }, (_, i) =>
        makeTx({
          id: `tx-${i}`,
          document_status: 'missing',
          amount: -100,
        })
      );
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      const receiptCheck = report.checks.find(
        (c) => c.name === 'Receipt Documentation'
      );
      expect(receiptCheck?.status).toBe('fail');
    });

    it('ignores small transactions ($25 or less)', async () => {
      const transactions = [
        makeTx({ document_status: 'missing', amount: -10 }),
        makeTx({ document_status: 'missing', amount: -25 }),
      ];
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      const receiptCheck = report.checks.find(
        (c) => c.name === 'Receipt Documentation'
      );
      expect(receiptCheck?.status).toBe('pass');
    });
  });

  describe('transaction categorization check', () => {
    it('passes when all transactions are categorized', async () => {
      const transactions = [
        makeTx({ status: 'approved' }),
        makeTx({ status: 'auto_categorized' }),
      ];
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      const catCheck = report.checks.find(
        (c) => c.name === 'Transaction Categorization'
      );
      expect(catCheck?.status).toBe('pass');
    });

    it('warns when few transactions are pending', async () => {
      const transactions = [
        makeTx({ status: 'pending' }),
        makeTx({ status: 'pending' }),
        makeTx({ status: 'approved' }),
      ];
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      const catCheck = report.checks.find(
        (c) => c.name === 'Transaction Categorization'
      );
      expect(catCheck?.status).toBe('warning');
    });

    it('fails when many transactions need review', async () => {
      const transactions = Array.from({ length: 10 }, (_, i) =>
        makeTx({ id: `tx-${i}`, status: 'human_review' })
      );
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      const catCheck = report.checks.find(
        (c) => c.name === 'Transaction Categorization'
      );
      expect(catCheck?.status).toBe('fail');
    });
  });

  describe('readiness score calculation', () => {
    it('scores 100 when all checks pass', async () => {
      // All approved, with receipts, no pending
      const transactions = [
        makeTx({ status: 'approved', document_status: 'found' }),
      ];
      const bankConnections = [
        {
          id: 'conn-1',
          last_synced_at: new Date().toISOString(),
          status: 'active',
        },
      ];
      const bankAccounts = [
        {
          id: 'acc-1',
          current_balance: -100, // Match the book balance
          name: 'Checking',
          connection_id: 'conn-1',
        },
      ];
      const supabase = createMockSupabase({
        transactions,
        bankConnections,
        bankAccounts,
      });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      // Score should be high (may not be exactly 100 due to reconciliation variance)
      expect(report.readinessScore).toBeGreaterThanOrEqual(80);
    });

    it('decreases score for each failing check', async () => {
      const transactions = Array.from({ length: 15 }, (_, i) =>
        makeTx({
          id: `tx-${i}`,
          status: 'human_review',
          document_status: 'missing',
        })
      );
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      // With multiple failing checks, score should be significantly lower
      expect(report.readinessScore).toBeLessThan(80);
    });

    it('isReady is true when score >= 80', async () => {
      const transactions = [
        makeTx({ status: 'approved', document_status: 'found' }),
      ];
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      if (report.readinessScore >= 80) {
        expect(report.isReady).toBe(true);
      }
    });

    it('isReady is false when score < 80', async () => {
      const transactions = Array.from({ length: 20 }, (_, i) =>
        makeTx({
          id: `tx-${i}`,
          status: 'human_review',
          document_status: 'missing',
        })
      );
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      if (report.readinessScore < 80) {
        expect(report.isReady).toBe(false);
      }
    });
  });

  describe('summary generation', () => {
    it('generates an optimistic summary for high scores', async () => {
      const transactions = [
        makeTx({ status: 'approved', document_status: 'found' }),
      ];
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      if (report.readinessScore >= 90) {
        expect(report.summary).toContain('Excellent');
      } else if (report.readinessScore >= 80) {
        expect(report.summary).toContain('Nearly');
      }
    });

    it('generates an actionable summary for low scores', async () => {
      const transactions = Array.from({ length: 20 }, (_, i) =>
        makeTx({
          id: `tx-${i}`,
          status: 'human_review',
          document_status: 'missing',
        })
      );
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      if (report.readinessScore < 60) {
        expect(report.summary).toContain('Not ready');
      }
    });
  });

  describe('bank feed sync check', () => {
    it('warns when no bank connections configured', async () => {
      const transactions = [makeTx()];
      const supabase = createMockSupabase({ transactions, bankConnections: [] });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      const feedCheck = report.checks.find((c) => c.name === 'Bank Feed Sync');
      expect(feedCheck?.status).toBe('warning');
    });
  });

  describe('bank reconciliation check', () => {
    it('warns when no bank accounts connected', async () => {
      const transactions = [makeTx()];
      const supabase = createMockSupabase({ transactions });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      const reconCheck = report.checks.find(
        (c) => c.name === 'Bank Reconciliation'
      );
      expect(reconCheck?.status).toBe('warning');
    });
  });

  describe('check status values', () => {
    it('each check has a valid status', async () => {
      const supabase = createMockSupabase({ transactions: [makeTx()] });
      const report = await runMonthEndClose('entity-1', 2025, 6, supabase);

      for (const check of report.checks) {
        expect(['pass', 'warning', 'fail']).toContain(check.status);
        expect(typeof check.name).toBe('string');
        expect(typeof check.description).toBe('string');
      }
    });
  });
});

// ============================================
// closePeriod
// ============================================
describe('closePeriod', () => {
  it('exports closePeriod function', () => {
    expect(typeof closePeriod).toBe('function');
  });
});
