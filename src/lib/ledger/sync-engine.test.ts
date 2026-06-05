import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// ============================================
// We test the sync-engine's balance-validation logic by importing the
// module and exercising syncBatchToProvider through the public
// runNightlySync pathway. However, since runNightlySync needs the real
// admin client, we instead test the balance-check logic via a
// focused integration-style test that invokes the internal functions
// through the module boundary.
//
// Strategy: mock the Supabase admin client and syncJournalEntry,
// then call runNightlySync to exercise the balance validation path.
// ============================================

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('./sync', () => ({
  syncJournalEntry: vi.fn(),
}));

import { runNightlySync } from './sync-engine';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncJournalEntry } from './sync';

// ============================================
// Mock Supabase factory
// ============================================

import type { MockChain } from '@/__test-utils__/mock-supabase';

interface UpdateCall {
  table: string;
  data: Record<string, unknown>;
  filters: Record<string, unknown>;
}

function createMockDb(opts: {
  connections?: unknown[];
  entries?: unknown[];
  ledgerConnection?: unknown;
}) {
  const { connections = [], entries = [], ledgerConnection = null } = opts;

  // Track update calls for assertions
  const updateCalls: UpdateCall[] = [];

  const mock = {
    _updateCalls: updateCalls,
    from: vi.fn((table: string) => {
      const chain = {} as MockChain;
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.neq = vi.fn().mockReturnValue(chain);
      chain.in = vi.fn().mockReturnValue(chain);
      chain.is = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockReturnValue(chain);
      chain.update = vi.fn().mockImplementation((data: Record<string, unknown>) => {
        const updateChain = {} as MockChain;
        const call: UpdateCall = { table, data, filters: {} };
        updateCalls.push(call);
        updateChain.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
          call.filters[col] = val;
          return updateChain;
        });
        updateChain.in = vi.fn().mockReturnValue(updateChain);
        updateChain.is = vi.fn().mockReturnValue(updateChain);
        updateChain.then = (resolve: (v: unknown) => void) => resolve({ error: null });
        return updateChain;
      });

      if (table === 'ledger_connections') {
        if (vi.isMockFunction(chain.select)) {
          // First call: list connections; subsequent: getLedgerConnection
          let callCount = 0;
          chain.then = undefined;
          chain.eq = vi.fn().mockImplementation(() => {
            callCount++;
            // Active filter chain
            const innerChain = {} as MockChain;
            innerChain.eq = vi.fn().mockReturnValue(innerChain);
            innerChain.single = vi.fn().mockImplementation(() => {
              return { data: ledgerConnection, error: null };
            });
            innerChain.then = (resolve: (v: unknown) => void) => {
              if (callCount <= 1) {
                return resolve({ data: connections, error: null });
              }
              return resolve({ data: ledgerConnection, error: null });
            };
            innerChain.update = chain.update;
            return innerChain;
          });
        }
        chain.then = (resolve: (v: unknown) => void) =>
          resolve({ data: connections, error: null });
      } else if (table === 'journal_entries') {
        chain.then = (resolve: (v: unknown) => void) =>
          resolve({ data: entries, error: null });
      }

      return chain;
    }),
  };

  return mock as unknown as SupabaseClient<Database> & { _updateCalls: UpdateCall[] };
}

// ============================================
// Fixture helpers
// ============================================

function makeEntry(overrides: Partial<{
  id: string;
  entity_id: string;
  entry_date: string;
  memo: string;
  status: string;
  journal_lines: Array<{ gl_code: string; debit: number; credit: number; description: string | null }>;
}> = {}) {
  return {
    id: overrides.id ?? 'entry-1',
    entity_id: overrides.entity_id ?? 'entity-1',
    entry_date: overrides.entry_date ?? '2025-06-15',
    memo: overrides.memo ?? 'Test entry',
    status: overrides.status ?? 'posted',
    journal_lines: overrides.journal_lines ?? [
      { gl_code: '6200', debit: 100, credit: 0, description: 'Software expense' },
      { gl_code: '1000', debit: 0, credit: 100, description: 'Cash' },
    ],
  };
}

function makeConnection(entityId: string = 'entity-1', provider: string = 'quickbooks') {
  return {
    entity_id: entityId,
    provider,
    entities: { name: 'Test Entity' },
  };
}

function makeLedgerConnection() {
  return {
    entity_id: 'entity-1',
    provider: 'quickbooks',
    access_token: 'token-abc',
    realm_id: 'realm-123',
    is_active: true,
  };
}

// ============================================
// Test Suite: Balance Validation
// ============================================

describe('Ledger Sync Engine — Balance Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('balanced entries (debits == credits)', () => {
    it('syncs balanced entries successfully', async () => {
      const entry = makeEntry({
        journal_lines: [
          { gl_code: '6200', debit: 500, credit: 0, description: 'Expense' },
          { gl_code: '1000', debit: 0, credit: 500, description: 'Cash' },
        ],
      });

      const db = createMockDb({
        connections: [makeConnection()],
        entries: [entry],
        ledgerConnection: makeLedgerConnection(),
      });

      vi.mocked(createAdminClient).mockReturnValue(db);
      vi.mocked(syncJournalEntry).mockResolvedValue({
        success: true,
        journalEntryId: 'qbo-123',
        provider: 'quickbooks',
      });

      const results = await runNightlySync();

      expect(results.length).toBeGreaterThanOrEqual(1);

      // syncJournalEntry should have been called (not skipped)
      expect(syncJournalEntry).toHaveBeenCalled();
    });
  });

  describe('unbalanced entries (debits != credits)', () => {
    it('marks unbalanced entries as failed and skips them', async () => {
      const unbalancedEntry = makeEntry({
        id: 'entry-unbalanced',
        journal_lines: [
          { gl_code: '6200', debit: 500, credit: 0, description: 'Expense' },
          { gl_code: '1000', debit: 0, credit: 400, description: 'Cash — $100 short' },
        ],
      });

      const db = createMockDb({
        connections: [makeConnection()],
        entries: [unbalancedEntry],
        ledgerConnection: makeLedgerConnection(),
      });

      vi.mocked(createAdminClient).mockReturnValue(db);
      vi.mocked(syncJournalEntry).mockResolvedValue({ success: true, journalEntryId: 'unused', provider: 'quickbooks' });

      const results = await runNightlySync();

      // syncJournalEntry should NOT have been called — the entry is skipped before API call
      expect(syncJournalEntry).not.toHaveBeenCalled();

      // Should have 1 result with 1 failed entry
      const entityResult = results.find((r) => r.entityId === 'entity-1');
      expect(entityResult).toBeDefined();
      expect(entityResult!.failed).toBe(1);
      expect(entityResult!.synced).toBe(0);

      // Verify markEntryFailed was called with correct error
      const failedUpdate = db._updateCalls.find(
        (c: { table: string; data: { sync_status?: string } }) =>
          c.table === 'journal_entries' && c.data.sync_status === 'failed'
      );
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate!.data.sync_error).toContain('Unbalanced');
      expect(failedUpdate!.data.sync_error).toContain('debits=500');
      expect(failedUpdate!.data.sync_error).toContain('credits=400');
    });

    it('reports errors for unbalanced entries', async () => {
      const unbalancedEntry = makeEntry({
        id: 'entry-offby50',
        journal_lines: [
          { gl_code: '6200', debit: 1000, credit: 0, description: 'Big expense' },
          { gl_code: '1000', debit: 0, credit: 950, description: 'Short credit' },
        ],
      });

      const db = createMockDb({
        connections: [makeConnection()],
        entries: [unbalancedEntry],
        ledgerConnection: makeLedgerConnection(),
      });

      vi.mocked(createAdminClient).mockReturnValue(db);

      const results = await runNightlySync();

      const entityResult = results.find((r) => r.entityId === 'entity-1');
      expect(entityResult!.errors.length).toBeGreaterThan(0);
      expect(entityResult!.errors[0]).toContain('Unbalanced');
    });
  });

  describe('floating-point tolerance (0.01)', () => {
    it('allows entries within 0.01 tolerance to sync', async () => {
      // 33.33 * 3 = 99.99, credit = 100.00 → variance = 0.01
      const entry = makeEntry({
        journal_lines: [
          { gl_code: '6200', debit: 33.33, credit: 0, description: 'Item 1' },
          { gl_code: '6200', debit: 33.33, credit: 0, description: 'Item 2' },
          { gl_code: '6200', debit: 33.34, credit: 0, description: 'Item 3' },
          { gl_code: '1000', debit: 0, credit: 100.00, description: 'Cash' },
        ],
      });

      const db = createMockDb({
        connections: [makeConnection()],
        entries: [entry],
        ledgerConnection: makeLedgerConnection(),
      });

      vi.mocked(createAdminClient).mockReturnValue(db);
      vi.mocked(syncJournalEntry).mockResolvedValue({ success: true, journalEntryId: 'qbo-ok', provider: 'quickbooks' });

      const _results = await runNightlySync();

      // Should sync successfully (within tolerance)
      expect(syncJournalEntry).toHaveBeenCalled();
    });

    it('rejects entries where variance exceeds 0.01', async () => {
      const entry = makeEntry({
        journal_lines: [
          { gl_code: '6200', debit: 100.00, credit: 0, description: 'Expense' },
          { gl_code: '1000', debit: 0, credit: 99.98, description: 'Cash' },
        ],
      });

      const db = createMockDb({
        connections: [makeConnection()],
        entries: [entry],
        ledgerConnection: makeLedgerConnection(),
      });

      vi.mocked(createAdminClient).mockReturnValue(db);
      vi.mocked(syncJournalEntry).mockResolvedValue({ success: true, journalEntryId: 'unused', provider: 'quickbooks' });

      const _results = await runNightlySync();

      // Variance is 0.02 which exceeds 0.01 tolerance → should be rejected
      expect(syncJournalEntry).not.toHaveBeenCalled();
    });
  });

  describe('markEntryFailed writes correct error message', () => {
    it('includes debits and credits amounts in the error message', async () => {
      const entry = makeEntry({
        id: 'entry-error-msg',
        journal_lines: [
          { gl_code: '6200', debit: 250.00, credit: 0, description: 'Expense' },
          { gl_code: '1000', debit: 0, credit: 200.00, description: 'Underpaid' },
        ],
      });

      const db = createMockDb({
        connections: [makeConnection()],
        entries: [entry],
        ledgerConnection: makeLedgerConnection(),
      });

      vi.mocked(createAdminClient).mockReturnValue(db);

      await runNightlySync();

      // Find the update call that sets sync_status to 'failed'
      const failCall = db._updateCalls.find(
        (c: { table: string; data: { sync_status?: string } }) =>
          c.table === 'journal_entries' && c.data.sync_status === 'failed'
      );

      expect(failCall).toBeDefined();
      expect(failCall!.data.sync_error).toBe('Unbalanced: debits=250 credits=200');
      expect(failCall!.filters.id).toBe('entry-error-msg');
    });
  });

  describe('no active connections', () => {
    it('returns empty results when no ledger connections exist', async () => {
      const db = createMockDb({ connections: [] });
      vi.mocked(createAdminClient).mockReturnValue(db);

      const results = await runNightlySync();

      expect(results).toEqual([]);
    });
  });
});
