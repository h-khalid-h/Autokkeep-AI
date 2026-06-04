import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Mock dependencies before imports
// ============================================

vi.mock('@/lib/ledger/sync', () => ({
  buildJournalEntryFromTransaction: vi.fn(),
  syncJournalEntry: vi.fn(),
}));

import { pushApprovedTransactionsToLedger } from './auto-push';
import { buildJournalEntryFromTransaction, syncJournalEntry } from '@/lib/ledger/sync';

// ============================================
// Mock Supabase factory
// ============================================

/* eslint-disable @typescript-eslint/no-explicit-any */
interface MockChainConfig {
  transactions?: { data: any[] | null; error: any };
  connections?: { data: any[] | null; error: any };
  updateResult?: { error: any };
}

function createMockSupabase(config: MockChainConfig) {
  const updateCalls: Array<{ table: string; data: any; filters: Record<string, any> }> = [];

  const mock: any = {
    _updateCalls: updateCalls,
    from: vi.fn((table: string) => {
      const chain: any = {};

      // Common chaining methods
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.in = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);

      // Update method — tracks calls for assertions
      chain.update = vi.fn().mockImplementation((data: any) => {
        const updateChain: any = {};
        const call = { table, data, filters: {} as Record<string, any> };
        updateCalls.push(call);
        updateChain.eq = vi.fn().mockImplementation((col: string, val: any) => {
          call.filters[col] = val;
          return updateChain;
        });
        updateChain.then = (resolve: any) =>
          resolve(config.updateResult ?? { error: null });
        return updateChain;
      });

      // Resolve query results based on table
      if (table === 'transactions') {
        chain.then = (resolve: any) =>
          resolve(config.transactions ?? { data: [], error: null });
      } else if (table === 'ledger_connections') {
        chain.then = (resolve: any) =>
          resolve(config.connections ?? { data: [], error: null });
      }

      return chain;
    }),
  };

  return mock;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// Fixture helpers
// ============================================

function makeTx(overrides: Partial<{
  id: string;
  entity_id: string;
  amount: number;
  merchant_name: string | null;
  date: string;
  category_human: string | null;
  category_ai: string | null;
  ledger_sync_id: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 'tx-1',
    entity_id: overrides.entity_id ?? 'entity-1',
    amount: overrides.amount ?? 150,
    merchant_name: overrides.merchant_name ?? 'Office Depot',
    date: overrides.date ?? '2025-06-15',
    category_human: overrides.category_human ?? null,
    category_ai: overrides.category_ai ?? null,
    ledger_sync_id: overrides.ledger_sync_id ?? null,
  };
}

function makeConnection(overrides: Partial<{
  id: string;
  entity_id: string;
  provider: string;
  access_token: string;
  realm_id: string | null;
  tenant_id: string | null;
  bank_account_gl_code: string | null;
  status: string;
}> = {}) {
  return {
    id: overrides.id ?? 'conn-1',
    entity_id: overrides.entity_id ?? 'entity-1',
    provider: overrides.provider ?? 'quickbooks',
    access_token: overrides.access_token ?? 'token-abc',
    realm_id: overrides.realm_id ?? 'realm-123',
    tenant_id: overrides.tenant_id ?? null,
    bank_account_gl_code: 'bank_account_gl_code' in overrides ? overrides.bank_account_gl_code! : '1010',
    status: overrides.status ?? 'active',
  };
}

const sampleJournalEntry = {
  date: '2025-06-15',
  memo: 'Autokkeep auto-posted: Office Depot (tx-1)',
  lines: [
    { glCode: '6510', glName: '', debit: 150, credit: 0, description: 'Office Depot' },
    { glCode: '1010', glName: '', debit: 0, credit: 150, description: 'Office Depot' },
  ],
};

// ============================================
// Test Suite
// ============================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pushApprovedTransactionsToLedger', () => {
  // ── Empty transaction list ──────────────────────────────────────────────

  describe('empty transaction list', () => {
    it('returns zero counts when no transactions exist', async () => {
      const db = createMockSupabase({
        transactions: { data: [], error: null },
      });

      const result = await pushApprovedTransactionsToLedger(db);

      expect(result).toEqual({ pushed: 0, failed: 0, skipped: 0, errors: [] });
      expect(syncJournalEntry).not.toHaveBeenCalled();
    });

    it('returns zero counts when transactions query returns null', async () => {
      const db = createMockSupabase({
        transactions: { data: null, error: null },
      });

      const result = await pushApprovedTransactionsToLedger(db);

      expect(result).toEqual({ pushed: 0, failed: 0, skipped: 0, errors: [] });
    });
  });

  // ── Idempotency guard ──────────────────────────────────────────────────

  describe('idempotency guard (ledger_sync_id already set)', () => {
    it('skips sync and marks as pushed when transaction already has ledger_sync_id', async () => {
      const tx = makeTx({ ledger_sync_id: 'qbo-existing-123' });
      const db = createMockSupabase({
        transactions: { data: [tx], error: null },
        connections: { data: [makeConnection()], error: null },
      });

      const result = await pushApprovedTransactionsToLedger(db);

      // Should NOT call syncJournalEntry — already pushed
      expect(syncJournalEntry).not.toHaveBeenCalled();
      expect(buildJournalEntryFromTransaction).not.toHaveBeenCalled();

      // Should mark as pushed (update ledger_synced = true)
      expect(result.pushed).toBe(1);
      expect(result.failed).toBe(0);

      // Verify the update call
      const updateCall = db._updateCalls.find(
        (c: { table: string; data: { ledger_synced?: boolean } }) =>
          c.table === 'transactions' && c.data.ledger_synced === true
      );
      expect(updateCall).toBeDefined();
      expect(updateCall.filters.id).toBe('tx-1');
    });
  });

  // ── Successful sync ────────────────────────────────────────────────────

  describe('successful sync', () => {
    it('correctly calls syncJournalEntry for eligible transactions', async () => {
      const tx = makeTx({ category_human: '6200' });
      const db = createMockSupabase({
        transactions: { data: [tx], error: null },
        connections: { data: [makeConnection()], error: null },
      });

      vi.mocked(buildJournalEntryFromTransaction).mockReturnValue(sampleJournalEntry);
      vi.mocked(syncJournalEntry).mockResolvedValue({
        success: true,
        journalEntryId: 'qbo-je-999',
        provider: 'quickbooks',
      });

      const result = await pushApprovedTransactionsToLedger(db);

      expect(result.pushed).toBe(1);
      expect(result.failed).toBe(0);

      // Verify buildJournalEntryFromTransaction was called with correct args
      expect(buildJournalEntryFromTransaction).toHaveBeenCalledWith(
        {
          amount: 150,
          merchant_name: 'Office Depot',
          date: '2025-06-15',
          category_human: '6200',
          category_ai: undefined,
          id: 'tx-1',
        },
        '1010' // bank_account_gl_code
      );

      // Verify syncJournalEntry was called with correct provider and credentials
      expect(syncJournalEntry).toHaveBeenCalledWith(
        'quickbooks',
        {
          accessToken: 'token-abc',
          realmId: 'realm-123',
          tenantId: undefined,
        },
        sampleJournalEntry
      );
    });

    it('builds correct journal entry params — category_ai fallback', async () => {
      const tx = makeTx({
        category_human: null,
        category_ai: '5120',
        merchant_name: 'Amazon',
      });
      const db = createMockSupabase({
        transactions: { data: [tx], error: null },
        connections: { data: [makeConnection()], error: null },
      });

      vi.mocked(buildJournalEntryFromTransaction).mockReturnValue(sampleJournalEntry);
      vi.mocked(syncJournalEntry).mockResolvedValue({
        success: true,
        journalEntryId: 'qbo-je-100',
        provider: 'quickbooks',
      });

      await pushApprovedTransactionsToLedger(db);

      expect(buildJournalEntryFromTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          category_human: undefined, // null → undefined
          category_ai: '5120',
          merchant_name: 'Amazon',
        }),
        '1010'
      );
    });

    it('uses default bank_account_gl_code "1000" when connection has none', async () => {
      const tx = makeTx();
      const conn = makeConnection({ bank_account_gl_code: null });
      const db = createMockSupabase({
        transactions: { data: [tx], error: null },
        connections: { data: [conn], error: null },
      });

      vi.mocked(buildJournalEntryFromTransaction).mockReturnValue(sampleJournalEntry);
      vi.mocked(syncJournalEntry).mockResolvedValue({
        success: true,
        journalEntryId: 'qbo-je-200',
        provider: 'quickbooks',
      });

      await pushApprovedTransactionsToLedger(db);

      // Falls back to '1000'
      expect(buildJournalEntryFromTransaction).toHaveBeenCalledWith(
        expect.anything(),
        '1000'
      );
    });

    it('processes multiple transactions across multiple entities', async () => {
      const tx1 = makeTx({ id: 'tx-1', entity_id: 'entity-1' });
      const tx2 = makeTx({ id: 'tx-2', entity_id: 'entity-1' });
      const tx3 = makeTx({ id: 'tx-3', entity_id: 'entity-2' });

      const conn1 = makeConnection({ entity_id: 'entity-1' });
      const conn2 = makeConnection({ id: 'conn-2', entity_id: 'entity-2', provider: 'xero', realm_id: null, tenant_id: 'tenant-1' });

      const db = createMockSupabase({
        transactions: { data: [tx1, tx2, tx3], error: null },
        connections: { data: [conn1, conn2], error: null },
      });

      vi.mocked(buildJournalEntryFromTransaction).mockReturnValue(sampleJournalEntry);
      vi.mocked(syncJournalEntry).mockResolvedValue({
        success: true,
        journalEntryId: 'je-ok',
        provider: 'quickbooks',
      });

      const result = await pushApprovedTransactionsToLedger(db);

      expect(result.pushed).toBe(3);
      expect(syncJournalEntry).toHaveBeenCalledTimes(3);
    });
  });

  // ── Sync failure ───────────────────────────────────────────────────────

  describe('sync failure handling', () => {
    it('handles sync failure gracefully — records error and continues', async () => {
      const tx1 = makeTx({ id: 'tx-fail' });
      const tx2 = makeTx({ id: 'tx-ok' });
      const db = createMockSupabase({
        transactions: { data: [tx1, tx2], error: null },
        connections: { data: [makeConnection()], error: null },
      });

      vi.mocked(buildJournalEntryFromTransaction).mockReturnValue(sampleJournalEntry);
      vi.mocked(syncJournalEntry)
        .mockResolvedValueOnce({
          success: false,
          journalEntryId: '',
          provider: 'quickbooks',
          error: 'QBO rate limit exceeded',
        })
        .mockResolvedValueOnce({
          success: true,
          journalEntryId: 'qbo-je-ok',
          provider: 'quickbooks',
        });

      const result = await pushApprovedTransactionsToLedger(db);

      // First tx failed, second succeeded
      expect(result.failed).toBe(1);
      expect(result.pushed).toBe(1);
      expect(result.errors).toEqual([
        { transactionId: 'tx-fail', error: 'QBO rate limit exceeded' },
      ]);

      // Should record error on failed transaction row
      const errorUpdate = db._updateCalls.find(
        (c: { table: string; data: { ledger_sync_error?: string }; filters: Record<string, string> }) =>
          c.table === 'transactions' &&
          c.data.ledger_sync_error === 'QBO rate limit exceeded' &&
          c.filters.id === 'tx-fail'
      );
      expect(errorUpdate).toBeDefined();
    });

    it('handles thrown exception during sync — logs error, continues to next', async () => {
      const tx1 = makeTx({ id: 'tx-throw' });
      const tx2 = makeTx({ id: 'tx-after' });
      const db = createMockSupabase({
        transactions: { data: [tx1, tx2], error: null },
        connections: { data: [makeConnection()], error: null },
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(buildJournalEntryFromTransaction)
        .mockImplementationOnce(() => {
          throw new Error('Unexpected null amount');
        })
        .mockReturnValueOnce(sampleJournalEntry);

      vi.mocked(syncJournalEntry).mockResolvedValue({
        success: true,
        journalEntryId: 'qbo-je-after',
        provider: 'quickbooks',
      });

      const result = await pushApprovedTransactionsToLedger(db);

      expect(result.failed).toBe(1);
      expect(result.pushed).toBe(1);
      expect(result.errors[0]).toEqual({
        transactionId: 'tx-throw',
        error: 'Unexpected null amount',
      });

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Auto-Push] Failed to sync transaction tx-throw'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('records "Unknown sync error" when sync result has no error message', async () => {
      const tx = makeTx({ id: 'tx-unknown-err' });
      const db = createMockSupabase({
        transactions: { data: [tx], error: null },
        connections: { data: [makeConnection()], error: null },
      });

      vi.mocked(buildJournalEntryFromTransaction).mockReturnValue(sampleJournalEntry);
      vi.mocked(syncJournalEntry).mockResolvedValue({
        success: false,
        journalEntryId: '',
        provider: 'quickbooks',
        // no error field
      });

      const result = await pushApprovedTransactionsToLedger(db);

      expect(result.errors[0].error).toBe('Unknown sync error');
    });
  });

  // ── Missing ledger connection ──────────────────────────────────────────

  describe('missing ledger connection', () => {
    it('skips all transactions for entities without an active connection', async () => {
      const tx1 = makeTx({ id: 'tx-1', entity_id: 'entity-no-conn' });
      const tx2 = makeTx({ id: 'tx-2', entity_id: 'entity-no-conn' });

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const db = createMockSupabase({
        transactions: { data: [tx1, tx2], error: null },
        connections: { data: [], error: null }, // No connections
      });

      const result = await pushApprovedTransactionsToLedger(db);

      expect(result.skipped).toBe(2);
      expect(result.pushed).toBe(0);
      expect(result.failed).toBe(0);
      expect(syncJournalEntry).not.toHaveBeenCalled();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping 2 txns for entity entity-no-conn')
      );

      consoleSpy.mockRestore();
    });
  });

  // ── Database errors ────────────────────────────────────────────────────

  describe('database errors', () => {
    it('throws when transaction fetch fails', async () => {
      const db = createMockSupabase({
        transactions: { data: null, error: { message: 'connection refused' } },
      });

      await expect(pushApprovedTransactionsToLedger(db)).rejects.toThrow(
        'Failed to fetch unsynced transactions: connection refused'
      );
    });

    it('throws when ledger_connections fetch fails', async () => {
      const db = createMockSupabase({
        transactions: { data: [makeTx()], error: null },
        connections: { data: null, error: { message: 'timeout' } },
      });

      await expect(pushApprovedTransactionsToLedger(db)).rejects.toThrow(
        'Failed to fetch ledger connections: timeout'
      );
    });
  });
});
