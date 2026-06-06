import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/plaid/client', () => ({
  syncTransactions: vi.fn(),
}));

vi.mock('@/lib/crypto', () => ({
  decryptToken: vi.fn((t: string) => `decrypted_${t}`),
}));

import { ingestTransactions, type BankConnection } from './ingest';
import { syncTransactions } from '@/lib/plaid/client';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  // Make the chain thenable so `await supabase.from(...)...` resolves
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

function makeMockDb() {
  const fromFn = vi.fn();
  return { from: fromFn };
}

const baseConnection: BankConnection = {
  id: 'conn-001',
  entity_id: 'entity-001',
  plaid_access_token: 'encrypted_token',
  cursor: null,
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('ingestTransactions', () => {
  let realDateNow: () => number;

  beforeEach(() => {
    vi.clearAllMocks();
    // Fix Date.now so retention_lock_until is deterministic
    realDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it('sets retention_lock_until to 7 years from now in YYYY-MM-DD format', async () => {
    // Freeze time to 2026-01-15
    const frozen = new Date('2026-01-15T12:00:00Z');
    vi.useFakeTimers({ now: frozen });

    const addedTx = {
      account_id: 'plaid-acct-1',
      transaction_id: 'plaid-tx-1',
      amount: 42.50,
      date: '2026-01-15',
      merchant_name: 'Starbucks',
      name: 'STARBUCKS #12345',
      iso_currency_code: 'USD',
    };

    (syncTransactions as ReturnType<typeof vi.fn>).mockResolvedValue({
      added: [addedTx],
      modified: [],
      removed: [],
      nextCursor: 'cursor-abc',
    });

    const bankAccountsChain = createChainMock({
      data: [{ id: 'ba-001', plaid_account_id: 'plaid-acct-1' }],
      error: null,
    });

    let upsertedRecords: unknown[] = [];
    const txnChain: Record<string, ReturnType<typeof vi.fn>> = {};
    txnChain.select = vi.fn().mockReturnValue(txnChain);
    txnChain.eq = vi.fn().mockReturnValue(txnChain);
    txnChain.in = vi.fn().mockReturnValue(txnChain);
    txnChain.update = vi.fn().mockReturnValue(txnChain);
    txnChain.upsert = vi.fn().mockImplementation((records: unknown[]) => {
      upsertedRecords = records;
      return { then: (resolve: (v: unknown) => void) => resolve({ data: records, error: null }) };
    });
    txnChain.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: null, error: null }));

    const connChain = createChainMock({ data: [{ id: 'conn-001' }], error: null });

    const mockDb = makeMockDb();
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'bank_accounts') return bankAccountsChain;
      if (table === 'transactions') return txnChain;
      if (table === 'bank_connections') return connChain;
      return createChainMock({ data: null, error: null });
    });

    const result = await ingestTransactions(mockDb, baseConnection);

    expect(result.added).toBe(1);
    expect(upsertedRecords).toHaveLength(1);

    const record = upsertedRecords[0] as Record<string, unknown>;

    // Key assertion: retention_lock_until is set
    expect(record.retention_lock_until).toBeDefined();

    // Key assertion: format is YYYY-MM-DD (not full ISO)
    const retentionDate = record.retention_lock_until as string;
    expect(retentionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Key assertion: 7 years from the frozen date
    expect(retentionDate).toBe('2033-01-15');

    vi.useRealTimers();
  });

  it('maps bank_account_id from plaid_account_id correctly', async () => {
    const addedTx = {
      account_id: 'plaid-acct-99',
      transaction_id: 'plaid-tx-99',
      amount: 10.00,
      date: '2026-03-01',
      merchant_name: 'Test Merchant',
      name: 'TEST MERCHANT',
      iso_currency_code: 'EUR',
    };

    (syncTransactions as ReturnType<typeof vi.fn>).mockResolvedValue({
      added: [addedTx],
      modified: [],
      removed: [],
      nextCursor: 'cursor-99',
    });

    const bankAccountsChain = createChainMock({
      data: [{ id: 'ba-99', plaid_account_id: 'plaid-acct-99' }],
      error: null,
    });

    let upsertedRecords: unknown[] = [];
    const txnChain: Record<string, ReturnType<typeof vi.fn>> = {};
    txnChain.select = vi.fn().mockReturnValue(txnChain);
    txnChain.eq = vi.fn().mockReturnValue(txnChain);
    txnChain.in = vi.fn().mockReturnValue(txnChain);
    txnChain.update = vi.fn().mockReturnValue(txnChain);
    txnChain.upsert = vi.fn().mockImplementation((records: unknown[]) => {
      upsertedRecords = records;
      return { then: (resolve: (v: unknown) => void) => resolve({ data: records, error: null }) };
    });
    txnChain.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: null, error: null }));

    const connChain = createChainMock({ data: [{ id: 'conn-001' }], error: null });

    const mockDb = makeMockDb();
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'bank_accounts') return bankAccountsChain;
      if (table === 'transactions') return txnChain;
      if (table === 'bank_connections') return connChain;
      return createChainMock({ data: null, error: null });
    });

    const result = await ingestTransactions(mockDb, baseConnection);
    expect(result.added).toBe(1);

    const record = upsertedRecords[0] as Record<string, unknown>;
    expect(record.bank_account_id).toBe('ba-99');
    expect(record.currency).toBe('EUR');
    expect(record.status).toBe('pending');
    expect(record.retention_lock_until).toBeDefined();
    expect((record.retention_lock_until as string)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles empty sync result without crashing', async () => {
    (syncTransactions as ReturnType<typeof vi.fn>).mockResolvedValue({
      added: [],
      modified: [],
      removed: [],
      nextCursor: 'cursor-empty',
    });

    const bankAccountsChain = createChainMock({ data: [], error: null });
    const connChain = createChainMock({ data: [{ id: 'conn-001' }], error: null });

    const mockDb = makeMockDb();
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'bank_accounts') return bankAccountsChain;
      if (table === 'bank_connections') return connChain;
      return createChainMock({ data: null, error: null });
    });

    const result = await ingestTransactions(mockDb, baseConnection);
    expect(result.added).toBe(0);
    expect(result.modified).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.cursor).toBe('cursor-empty');
  });

  it('defaults currency to USD when iso_currency_code is null', async () => {
    const addedTx = {
      account_id: 'plaid-acct-1',
      transaction_id: 'plaid-tx-nocurr',
      amount: 5.00,
      date: '2026-02-01',
      merchant_name: null,
      name: 'UNKNOWN MERCHANT',
      iso_currency_code: null,
    };

    (syncTransactions as ReturnType<typeof vi.fn>).mockResolvedValue({
      added: [addedTx],
      modified: [],
      removed: [],
      nextCursor: 'cursor-nocurr',
    });

    const bankAccountsChain = createChainMock({
      data: [{ id: 'ba-001', plaid_account_id: 'plaid-acct-1' }],
      error: null,
    });

    let upsertedRecords: unknown[] = [];
    const txnChain: Record<string, ReturnType<typeof vi.fn>> = {};
    txnChain.select = vi.fn().mockReturnValue(txnChain);
    txnChain.eq = vi.fn().mockReturnValue(txnChain);
    txnChain.upsert = vi.fn().mockImplementation((records: unknown[]) => {
      upsertedRecords = records;
      return { then: (resolve: (v: unknown) => void) => resolve({ data: records, error: null }) };
    });
    txnChain.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: null, error: null }));

    const connChain = createChainMock({ data: [{ id: 'conn-001' }], error: null });

    const mockDb = makeMockDb();
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'bank_accounts') return bankAccountsChain;
      if (table === 'transactions') return txnChain;
      if (table === 'bank_connections') return connChain;
      return createChainMock({ data: null, error: null });
    });

    await ingestTransactions(mockDb, baseConnection);

    const record = upsertedRecords[0] as Record<string, unknown>;
    expect(record.currency).toBe('USD');
    // Falls back to `name` when `merchant_name` is null
    expect(record.merchant_name).toBe('UNKNOWN MERCHANT');
  });
});
