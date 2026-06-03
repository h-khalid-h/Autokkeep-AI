import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildJournalEntryFromTransaction,
  syncJournalEntry,
  syncChartOfAccounts,
  type LedgerProvider,
} from './sync';

// ============================================
// Mock global fetch
// ============================================
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================
// buildJournalEntryFromTransaction
// ============================================
describe('buildJournalEntryFromTransaction', () => {
  const baseTransaction = {
    id: 'tx-001',
    amount: 150,
    merchant_name: 'Office Depot',
    date: '2025-06-15',
    category_human: undefined as string | undefined,
    category_ai: undefined as string | undefined,
  };

  describe('expense transactions (amount > 0)', () => {
    it('creates correct debit/credit lines for an expense', () => {
      const txn = { ...baseTransaction, amount: 150 };
      const entry = buildJournalEntryFromTransaction(txn, '1010');

      expect(entry.date).toBe('2025-06-15');
      expect(entry.memo).toContain('Office Depot');
      expect(entry.memo).toContain('tx-001');
      expect(entry.lines).toHaveLength(2);

      // Line 1: Debit expense GL
      expect(entry.lines[0].debit).toBe(150);
      expect(entry.lines[0].credit).toBe(0);
      expect(entry.lines[0].description).toBe('Office Depot');

      // Line 2: Credit bank GL
      expect(entry.lines[1].glCode).toBe('1010');
      expect(entry.lines[1].debit).toBe(0);
      expect(entry.lines[1].credit).toBe(150);
    });

    it('uses category_human GL code when available', () => {
      const txn = { ...baseTransaction, category_human: '6510', category_ai: '5120' };
      const entry = buildJournalEntryFromTransaction(txn, '1010');

      expect(entry.lines[0].glCode).toBe('6510');
    });

    it('falls back to category_ai when category_human is not set', () => {
      const txn = { ...baseTransaction, category_ai: '5120' };
      const entry = buildJournalEntryFromTransaction(txn, '1010');

      expect(entry.lines[0].glCode).toBe('5120');
    });

    it('uses defaultExpenseGLCode when no category is set', () => {
      const txn = { ...baseTransaction };
      const entry = buildJournalEntryFromTransaction(txn, '1010');

      // Default is '6510'
      expect(entry.lines[0].glCode).toBe('6510');
    });

    it('uses custom defaultExpenseGLCode when provided', () => {
      const txn = { ...baseTransaction };
      const entry = buildJournalEntryFromTransaction(txn, '1010', '7000');

      expect(entry.lines[0].glCode).toBe('7000');
    });
  });

  describe('income transactions (amount <= 0)', () => {
    it('reverses debit/credit lines for income', () => {
      const txn = { ...baseTransaction, amount: -500 };
      const entry = buildJournalEntryFromTransaction(txn, '1010');

      expect(entry.lines).toHaveLength(2);

      // Line 1: Credit bank GL (isExpense=false, so first line has credit)
      expect(entry.lines[0].glCode).toBe('1010');
      expect(entry.lines[0].credit).toBe(500);
      expect(entry.lines[0].debit).toBe(0);

      // Line 2: Debit income GL
      expect(entry.lines[1].debit).toBe(500);
      expect(entry.lines[1].credit).toBe(0);
    });
  });

  describe('handles custom GL codes', () => {
    it('applies human-overridden GL code', () => {
      const txn = {
        ...baseTransaction,
        amount: 200,
        category_human: '6410',
        category_ai: '6510',
      };
      const entry = buildJournalEntryFromTransaction(txn, '1010');

      // Human override takes precedence
      expect(entry.lines[0].glCode).toBe('6410');
    });
  });
});

// ============================================
// syncJournalEntry
// ============================================
describe('syncJournalEntry', () => {
  const sampleEntry = {
    date: '2025-06-15',
    memo: 'Test entry',
    lines: [
      { glCode: '6510', glName: 'Office Supplies', debit: 100, credit: 0, description: 'Test' },
      { glCode: '1010', glName: 'Cash', debit: 0, credit: 100, description: 'Test' },
    ],
  };

  describe('QuickBooks sync', () => {
    it('syncs successfully to QuickBooks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          JournalEntry: { Id: 'qbo-je-123', DocNumber: 'JE-001' },
        }),
      });

      const result = await syncJournalEntry(
        'quickbooks',
        { accessToken: 'token-abc', realmId: 'realm-123' },
        sampleEntry
      );

      expect(result.success).toBe(true);
      expect(result.provider).toBe('quickbooks');
      expect(result.journalEntryId).toBe('qbo-je-123');
      expect(result.docNumber).toBe('JE-001');
    });

    it('returns error when realmId is missing', async () => {
      const result = await syncJournalEntry(
        'quickbooks',
        { accessToken: 'token-abc' },
        sampleEntry
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing QBO realmId');
    });

    it('handles API error gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Internal Server Error',
      });

      const result = await syncJournalEntry(
        'quickbooks',
        { accessToken: 'token-abc', realmId: 'realm-123' },
        sampleEntry
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('QBO journal entry creation failed');
    });

    it('handles fetch exception gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await syncJournalEntry(
        'quickbooks',
        { accessToken: 'token-abc', realmId: 'realm-123' },
        sampleEntry
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });
  });

  describe('Xero sync', () => {
    it('syncs successfully to Xero', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ManualJournals: [{ ManualJournalID: 'xero-mj-456' }],
        }),
      });

      const result = await syncJournalEntry(
        'xero',
        { accessToken: 'token-xyz', tenantId: 'tenant-789' },
        sampleEntry
      );

      expect(result.success).toBe(true);
      expect(result.provider).toBe('xero');
      expect(result.journalEntryId).toBe('xero-mj-456');
    });

    it('returns error when tenantId is missing', async () => {
      const result = await syncJournalEntry(
        'xero',
        { accessToken: 'token-xyz' },
        sampleEntry
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing Xero tenantId');
    });
  });

  describe('Unknown provider', () => {
    it('returns error for unknown provider', async () => {
      const result = await syncJournalEntry(
        'sage' as LedgerProvider,
        { accessToken: 'token' },
        sampleEntry
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown provider');
    });
  });
});

// ============================================
// syncChartOfAccounts
// ============================================
describe('syncChartOfAccounts', () => {
  describe('QuickBooks chart of accounts', () => {
    it('returns mapped accounts from QuickBooks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          QueryResponse: {
            Account: [
              { Id: '1', Name: 'Checking', AccountType: 'Bank', AcctNum: '1010' },
              { Id: '2', Name: 'Office Supplies', AccountType: 'Expense', AcctNum: '6510' },
              { Id: '3', Name: 'Revenue', AccountType: 'Income', AcctNum: '' },
            ],
          },
        }),
      });

      const accounts = await syncChartOfAccounts('quickbooks', {
        accessToken: 'token',
        realmId: 'realm-1',
      });

      expect(accounts).toHaveLength(3);

      expect(accounts[0]).toEqual({
        code: '1010',
        name: 'Checking',
        type: 'asset',
        externalId: '1',
      });

      expect(accounts[1]).toEqual({
        code: '6510',
        name: 'Office Supplies',
        type: 'expense',
        externalId: '2',
      });

      // When AcctNum is empty, falls back to Id
      expect(accounts[2].code).toBe('3');
      expect(accounts[2].type).toBe('revenue');
    });
  });

  describe('Xero chart of accounts', () => {
    it('returns mapped accounts from Xero', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Accounts: [
            { AccountID: 'x1', Name: 'Bank Account', Type: 'BANK', Code: '1000' },
            { AccountID: 'x2', Name: 'Sales', Type: 'REVENUE', Code: '4000' },
          ],
        }),
      });

      const accounts = await syncChartOfAccounts('xero', {
        accessToken: 'token',
        tenantId: 'tenant-1',
      });

      expect(accounts).toHaveLength(2);

      expect(accounts[0]).toEqual({
        code: '1000',
        name: 'Bank Account',
        type: 'asset',
        externalId: 'x1',
      });

      expect(accounts[1]).toEqual({
        code: '4000',
        name: 'Sales',
        type: 'revenue',
        externalId: 'x2',
      });
    });
  });

  describe('Edge cases', () => {
    it('returns empty array when realmId is missing for QuickBooks', async () => {
      const accounts = await syncChartOfAccounts('quickbooks', {
        accessToken: 'token',
      });
      expect(accounts).toEqual([]);
    });

    it('returns empty array when tenantId is missing for Xero', async () => {
      const accounts = await syncChartOfAccounts('xero', {
        accessToken: 'token',
      });
      expect(accounts).toEqual([]);
    });
  });
});
