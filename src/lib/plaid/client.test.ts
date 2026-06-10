import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Plaid ─────────────────────────────────────────────────────────────────
// Because the source uses a module-level singleton, we must NOT use vi.resetModules().
// Instead, we mock at the top level and clear mocks between tests.

const mockLinkTokenCreate = vi.fn();
const mockItemPublicTokenExchange = vi.fn();
const mockTransactionsSync = vi.fn();
const mockAccountsGet = vi.fn();
const mockInstitutionsGetById = vi.fn();
const mockItemRemove = vi.fn();

const mockPlaidApiInstance = {
  linkTokenCreate: mockLinkTokenCreate,
  itemPublicTokenExchange: mockItemPublicTokenExchange,
  transactionsSync: mockTransactionsSync,
  accountsGet: mockAccountsGet,
  institutionsGetById: mockInstitutionsGetById,
  itemRemove: mockItemRemove,
};

vi.mock('plaid', () => ({
  Configuration: vi.fn(),
  PlaidApi: vi.fn(function() { return mockPlaidApiInstance; }),
  PlaidEnvironments: {
    sandbox: 'https://sandbox.plaid.com',
    production: 'https://production.plaid.com',
  },
  Products: {
    Transactions: 'transactions',
  },
  CountryCode: {
    Us: 'US',
    Ca: 'CA',
    Gb: 'GB',
    Ie: 'IE',
    Fr: 'FR',
    Nl: 'NL',
    De: 'DE',
  },
}));

// Import after mocks are set up
import {
  getPlaidClient,
  createLinkToken,
  createUpdateLinkToken,
  exchangePublicToken,
  syncTransactions,
  getAccounts,
  getInstitution,
  removeItem,
} from './client';

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('plaid/client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      PLAID_CLIENT_ID: 'test-client-id',
      PLAID_SECRET: 'test-secret',
      PLAID_ENV: 'sandbox',
      PLAID_WEBHOOK_URL: 'https://example.com/api/webhooks/plaid',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Client Singleton ──────────────────────────────────────────────────

  describe('getPlaidClient', () => {
    it('returns a PlaidApi instance', () => {
      const client = getPlaidClient();
      expect(client).toBeDefined();
      expect(client.linkTokenCreate).toBeDefined();
    });

    it('returns same instance on subsequent calls (singleton)', () => {
      const client1 = getPlaidClient();
      const client2 = getPlaidClient();
      expect(client1).toBe(client2);
    });

    it('has all expected API methods', () => {
      const client = getPlaidClient();
      expect(typeof client.linkTokenCreate).toBe('function');
      expect(typeof client.itemPublicTokenExchange).toBe('function');
      expect(typeof client.transactionsSync).toBe('function');
      expect(typeof client.accountsGet).toBe('function');
      expect(typeof client.institutionsGetById).toBe('function');
      expect(typeof client.itemRemove).toBe('function');
    });
  });

  // ── Link Token Creation ───────────────────────────────────────────────

  describe('createLinkToken', () => {
    it('creates a link token with correct params', async () => {
      mockLinkTokenCreate.mockResolvedValue({
        data: { link_token: 'link-test-token-123' },
      });
      const token = await createLinkToken('user-1', 'entity-1');
      expect(token).toBe('link-test-token-123');
      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user: { client_user_id: 'user-1' },
          client_name: 'Autokkeep',
          products: ['transactions'],
          language: 'en',
        })
      );
    });

    it('uses US country code by default', async () => {
      mockLinkTokenCreate.mockResolvedValue({
        data: { link_token: 'link-token' },
      });
      await createLinkToken('user-1', 'entity-1');
      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          country_codes: ['US'],
        })
      );
    });

    it('uses CA country code for Canada', async () => {
      mockLinkTokenCreate.mockResolvedValue({
        data: { link_token: 'link-token-ca' },
      });
      await createLinkToken('user-1', 'entity-1', 'CA');
      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          country_codes: ['CA'],
        })
      );
    });

    it('uses GB country code for UK', async () => {
      mockLinkTokenCreate.mockResolvedValue({
        data: { link_token: 'link-token-gb' },
      });
      await createLinkToken('user-1', 'entity-1', 'GB');
      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          country_codes: ['GB'],
        })
      );
    });

    it('falls back to US for unknown country code', async () => {
      mockLinkTokenCreate.mockResolvedValue({
        data: { link_token: 'link-token' },
      });
      await createLinkToken('user-1', 'entity-1', 'XX');
      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          country_codes: ['US'],
        })
      );
    });

    it('includes webhook URL from PLAID_WEBHOOK_URL env', async () => {
      mockLinkTokenCreate.mockResolvedValue({
        data: { link_token: 'link-token' },
      });
      await createLinkToken('user-1', 'entity-1');
      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          webhook: 'https://example.com/api/webhooks/plaid',
        })
      );
    });

    it('derives webhook URL from NEXT_PUBLIC_APP_URL when PLAID_WEBHOOK_URL is not set', async () => {
      delete process.env.PLAID_WEBHOOK_URL;
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.autokkeep.com';
      mockLinkTokenCreate.mockResolvedValue({
        data: { link_token: 'link-token' },
      });
      await createLinkToken('user-1', 'entity-1');
      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          webhook: 'https://app.autokkeep.com/api/webhooks/plaid',
        })
      );
    });

    it('omits webhook when neither URL env var is set', async () => {
      delete process.env.PLAID_WEBHOOK_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
      mockLinkTokenCreate.mockResolvedValue({
        data: { link_token: 'link-token' },
      });
      await createLinkToken('user-1', 'entity-1');
      const callArgs = mockLinkTokenCreate.mock.calls[0][0];
      expect(callArgs.webhook).toBeUndefined();
    });

    it('propagates Plaid API errors', async () => {
      mockLinkTokenCreate.mockRejectedValue(new Error('PLAID_ERROR'));
      await expect(createLinkToken('user-1', 'entity-1')).rejects.toThrow('PLAID_ERROR');
    });
  });

  // ── Update Link Token ─────────────────────────────────────────────────

  describe('createUpdateLinkToken', () => {
    it('creates update mode link token with access_token', async () => {
      mockLinkTokenCreate.mockResolvedValue({
        data: { link_token: 'update-link-token' },
      });
      const token = await createUpdateLinkToken('user-1', 'access-token-abc');
      expect(token).toBe('update-link-token');
      expect(mockLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: 'access-token-abc',
          user: { client_user_id: 'user-1' },
        })
      );
    });

    it('does NOT include products in update mode', async () => {
      mockLinkTokenCreate.mockResolvedValue({
        data: { link_token: 'update-token' },
      });
      await createUpdateLinkToken('user-1', 'access-token-abc');
      const callArgs = mockLinkTokenCreate.mock.calls[0][0];
      expect(callArgs.products).toBeUndefined();
    });
  });

  // ── Token Exchange ────────────────────────────────────────────────────

  describe('exchangePublicToken', () => {
    it('exchanges public token for access token and item ID', async () => {
      mockItemPublicTokenExchange.mockResolvedValue({
        data: {
          access_token: 'access-abc123',
          item_id: 'item-xyz789',
        },
      });
      const result = await exchangePublicToken('public-token-test');
      expect(result).toEqual({
        accessToken: 'access-abc123',
        itemId: 'item-xyz789',
      });
      expect(mockItemPublicTokenExchange).toHaveBeenCalledWith({
        public_token: 'public-token-test',
      });
    });

    it('propagates Plaid errors on token exchange failure', async () => {
      mockItemPublicTokenExchange.mockRejectedValue(new Error('INVALID_PUBLIC_TOKEN'));
      await expect(exchangePublicToken('bad-token')).rejects.toThrow('INVALID_PUBLIC_TOKEN');
    });
  });

  // ── Transaction Sync ──────────────────────────────────────────────────

  describe('syncTransactions', () => {
    it('syncs transactions in a single page', async () => {
      mockTransactionsSync.mockResolvedValue({
        data: {
          added: [
            {
              transaction_id: 'tx-1',
              account_id: 'acc-1',
              amount: -50.00,
              date: '2026-01-15',
              name: 'Coffee Shop',
              merchant_name: 'Starbucks',
              category: ['Food'],
              pending: false,
              payment_channel: 'in store',
              personal_finance_category: { primary: 'FOOD', detailed: 'COFFEE' },
              merchant_entity_id: 'ent-1',
              iso_currency_code: 'USD',
            },
          ],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: 'cursor-abc',
        },
      });
      const result = await syncTransactions('access-token');
      expect(result.added).toHaveLength(1);
      expect(result.added[0].transaction_id).toBe('tx-1');
      expect(result.added[0].amount).toBe(-50.00);
      expect(result.nextCursor).toBe('cursor-abc');
      expect(result.modified).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });

    it('handles multi-page pagination', async () => {
      // Page 1
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [
            {
              transaction_id: 'tx-1',
              account_id: 'acc-1',
              amount: 100,
              date: '2026-01-01',
              name: 'Test 1',
              merchant_name: null,
              category: null,
              pending: false,
              payment_channel: 'online',
              personal_finance_category: null,
              merchant_entity_id: null,
              iso_currency_code: 'USD',
            },
          ],
          modified: [],
          removed: [],
          has_more: true,
          next_cursor: 'cursor-page-2',
        },
      });
      // Page 2
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [
            {
              transaction_id: 'tx-2',
              account_id: 'acc-1',
              amount: 200,
              date: '2026-01-02',
              name: 'Test 2',
              merchant_name: null,
              category: null,
              pending: false,
              payment_channel: 'online',
              personal_finance_category: null,
              merchant_entity_id: null,
              iso_currency_code: 'USD',
            },
          ],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: 'cursor-final',
        },
      });

      const result = await syncTransactions('access-token');
      expect(result.added).toHaveLength(2);
      expect(result.added[0].transaction_id).toBe('tx-1');
      expect(result.added[1].transaction_id).toBe('tx-2');
      expect(result.nextCursor).toBe('cursor-final');
    });

    it('passes cursor when provided for incremental sync', async () => {
      mockTransactionsSync.mockResolvedValue({
        data: {
          added: [],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: 'cursor-next',
        },
      });
      await syncTransactions('access-token', 'cursor-prev');
      expect(mockTransactionsSync).toHaveBeenCalledWith({
        access_token: 'access-token',
        cursor: 'cursor-prev',
        count: 500,
      });
    });

    it('handles modified transactions', async () => {
      mockTransactionsSync.mockResolvedValue({
        data: {
          added: [],
          modified: [
            {
              transaction_id: 'tx-mod-1',
              account_id: 'acc-1',
              amount: 75.50,
              date: '2026-01-15',
              name: 'Updated Payment',
              merchant_name: 'ACME Corp',
            },
          ],
          removed: [],
          has_more: false,
          next_cursor: 'cursor-mod',
        },
      });
      const result = await syncTransactions('access-token');
      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].transaction_id).toBe('tx-mod-1');
      expect(result.modified[0].amount).toBe(75.50);
    });

    it('handles removed transactions', async () => {
      mockTransactionsSync.mockResolvedValue({
        data: {
          added: [],
          modified: [],
          removed: [{ transaction_id: 'tx-del-1' }, { transaction_id: 'tx-del-2' }],
          has_more: false,
          next_cursor: 'cursor-rm',
        },
      });
      const result = await syncTransactions('access-token');
      expect(result.removed).toHaveLength(2);
      expect(result.removed[0].transaction_id).toBe('tx-del-1');
    });

    it('enforces MAX_SYNC_PAGES limit (20 pages)', async () => {
      // Return has_more=true for 21 pages
      for (let i = 0; i < 21; i++) {
        mockTransactionsSync.mockResolvedValueOnce({
          data: {
            added: [
              {
                transaction_id: `tx-${i}`,
                account_id: 'acc-1',
                amount: 10,
                date: '2026-01-01',
                name: `Tx ${i}`,
                merchant_name: null,
                category: null,
                pending: false,
                payment_channel: 'online',
                personal_finance_category: null,
                merchant_entity_id: null,
                iso_currency_code: 'USD',
              },
            ],
            modified: [],
            removed: [],
            has_more: true,
            next_cursor: `cursor-${i}`,
          },
        });
      }
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await syncTransactions('access-token');
      // Should stop at 20 pages
      expect(result.added).toHaveLength(20);
      expect(mockTransactionsSync).toHaveBeenCalledTimes(20);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Hit max page limit')
      );
      warnSpy.mockRestore();
    });

    it('handles null optional fields gracefully', async () => {
      mockTransactionsSync.mockResolvedValue({
        data: {
          added: [
            {
              transaction_id: 'tx-null',
              account_id: 'acc-1',
              amount: 0,
              date: '2026-01-01',
              name: 'Null Fields',
              merchant_name: null,
              category: null,
              pending: true,
              payment_channel: 'other',
              personal_finance_category: null,
              merchant_entity_id: null,
              iso_currency_code: null,
            },
          ],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: 'c',
        },
      });
      const result = await syncTransactions('access-token');
      expect(result.added[0].merchant_name).toBeNull();
      expect(result.added[0].category).toBeNull();
      expect(result.added[0].personal_finance_category).toBeNull();
      expect(result.added[0].merchant_entity_id).toBeNull();
      expect(result.added[0].iso_currency_code).toBeNull();
    });
  });

  // ── Accounts ──────────────────────────────────────────────────────────

  describe('getAccounts', () => {
    it('retrieves accounts for an access token', async () => {
      const mockAccounts = [
        { account_id: 'acc-1', name: 'Checking', type: 'depository' },
        { account_id: 'acc-2', name: 'Savings', type: 'depository' },
      ];
      mockAccountsGet.mockResolvedValue({ data: { accounts: mockAccounts } });
      const accounts = await getAccounts('access-token');
      expect(accounts).toHaveLength(2);
      expect(accounts[0].account_id).toBe('acc-1');
      expect(mockAccountsGet).toHaveBeenCalledWith({ access_token: 'access-token' });
    });

    it('propagates API errors', async () => {
      mockAccountsGet.mockRejectedValue(new Error('ITEM_LOGIN_REQUIRED'));
      await expect(getAccounts('expired-token')).rejects.toThrow('ITEM_LOGIN_REQUIRED');
    });
  });

  // ── Institution ───────────────────────────────────────────────────────

  describe('getInstitution', () => {
    it('retrieves institution details by ID', async () => {
      const mockInstitution = { institution_id: 'ins_1', name: 'Chase' };
      mockInstitutionsGetById.mockResolvedValue({ data: { institution: mockInstitution } });
      const inst = await getInstitution('ins_1');
      expect(inst.name).toBe('Chase');
      expect(mockInstitutionsGetById).toHaveBeenCalledWith({
        institution_id: 'ins_1',
        country_codes: ['US'],
      });
    });

    it('uses specified country code', async () => {
      mockInstitutionsGetById.mockResolvedValue({
        data: { institution: { institution_id: 'ins_uk', name: 'Barclays' } },
      });
      await getInstitution('ins_uk', 'GB');
      expect(mockInstitutionsGetById).toHaveBeenCalledWith({
        institution_id: 'ins_uk',
        country_codes: ['GB'],
      });
    });
  });

  // ── Item Removal ──────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('removes item and returns true on success', async () => {
      mockItemRemove.mockResolvedValue({});
      const result = await removeItem('access-token');
      expect(result).toBe(true);
      expect(mockItemRemove).toHaveBeenCalledWith({ access_token: 'access-token' });
    });

    it('returns false and logs error on failure', async () => {
      mockItemRemove.mockRejectedValue(new Error('ITEM_NOT_FOUND'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await removeItem('bad-token');
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Plaid] Failed to remove item:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('does not throw on failure (graceful error handling)', async () => {
      mockItemRemove.mockRejectedValue(new Error('Network Error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Should NOT throw
      const result = await removeItem('access-token');
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });
});
