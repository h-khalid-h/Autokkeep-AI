// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Plaid Client Wrapper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';

// ─── Plaid Client Singleton ────────────────────────────────────────────────────

let plaidClient: PlaidApi | null = null;

/**
 * Creates and returns a singleton PlaidApi instance configured via env vars.
 */
export function getPlaidClient(): PlaidApi {
  if (!plaidClient) {
    const configuration = new Configuration({
      basePath:
        PlaidEnvironments[
          (process.env.PLAID_ENV as keyof typeof PlaidEnvironments) || 'sandbox'
        ],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
          'PLAID-SECRET': process.env.PLAID_SECRET!,
        },
      },
    });
    plaidClient = new PlaidApi(configuration);
  }
  return plaidClient;
}

// ─── Link Token ────────────────────────────────────────────────────────────────

/**
 * Creates a Plaid Link token for connecting bank accounts.
 */
export async function createLinkToken(
  userId: string,
  _entityId: string
): Promise<string> {
  const client = getPlaidClient();

  const response = await client.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'Autokkeep',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  });

  return response.data.link_token;
}

// ─── Token Exchange ────────────────────────────────────────────────────────────

/**
 * Exchanges a Plaid public token for a persistent access token + item ID.
 */
export async function exchangePublicToken(
  publicToken: string
): Promise<{ accessToken: string; itemId: string }> {
  const client = getPlaidClient();

  const response = await client.itemPublicTokenExchange({
    public_token: publicToken,
  });

  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

// ─── Transaction Sync ──────────────────────────────────────────────────────────

export interface PlaidSyncResult {
  added: Array<{
    transaction_id: string;
    account_id: string;
    amount: number;
    date: string;
    name: string;
    merchant_name: string | null;
    category: string[] | null;
    pending: boolean;
    payment_channel: string;
    personal_finance_category: {
      primary: string;
      detailed: string;
    } | null;
    merchant_entity_id: string | null;
    iso_currency_code: string | null;
  }>;
  modified: Array<{
    transaction_id: string;
    account_id: string;
    amount: number;
    date: string;
    name: string;
    merchant_name: string | null;
  }>;
  removed: Array<{ transaction_id: string }>;
  nextCursor: string;
}

/**
 * Syncs transactions using /transactions/sync endpoint.
 * Handles pagination via has_more. Returns all added/modified/removed
 * transactions plus the next cursor for incremental sync.
 */
export async function syncTransactions(
  accessToken: string,
  cursor?: string
): Promise<PlaidSyncResult> {
  const client = getPlaidClient();
  const MAX_SYNC_PAGES = 20; // Safety limit: 20 pages × 500 = 10,000 transactions max

  const added: PlaidSyncResult['added'] = [];
  const modified: PlaidSyncResult['modified'] = [];
  const removed: PlaidSyncResult['removed'] = [];
  let hasMore = true;
  let nextCursor = cursor || '';
  let pageCount = 0;

  while (hasMore && pageCount < MAX_SYNC_PAGES) {
    pageCount++;
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor || undefined,
      count: 500,
    });

    const data = response.data;

    added.push(
      ...data.added.map((t) => ({
        transaction_id: t.transaction_id,
        account_id: t.account_id,
        amount: t.amount,
        date: t.date,
        name: t.name,
        merchant_name: t.merchant_name || null,
        category: t.category || null,
        pending: t.pending,
        payment_channel: t.payment_channel,
        personal_finance_category: t.personal_finance_category
          ? {
              primary: t.personal_finance_category.primary,
              detailed: t.personal_finance_category.detailed,
            }
          : null,
        merchant_entity_id: t.merchant_entity_id || null,
        iso_currency_code: t.iso_currency_code || null,
      }))
    );

    modified.push(
      ...data.modified.map((t) => ({
        transaction_id: t.transaction_id,
        account_id: t.account_id,
        amount: t.amount,
        date: t.date,
        name: t.name,
        merchant_name: t.merchant_name || null,
      }))
    );

    removed.push(
      ...data.removed.map((t) => ({
        transaction_id: t.transaction_id!,
      }))
    );

    hasMore = data.has_more;
    nextCursor = data.next_cursor;
  }

  if (pageCount >= MAX_SYNC_PAGES && hasMore) {
    console.warn(`[Plaid Sync] Hit max page limit (${MAX_SYNC_PAGES}). Remaining transactions will sync on next run.`);
  }

  return { added, modified, removed, nextCursor };
}

// ─── Accounts ──────────────────────────────────────────────────────────────────

/**
 * Gets all accounts for a connected Plaid Item.
 */
export async function getAccounts(accessToken: string) {
  const client = getPlaidClient();
  const response = await client.accountsGet({ access_token: accessToken });
  return response.data.accounts;
}

// ─── Institution ───────────────────────────────────────────────────────────────

/**
 * Gets institution details by Plaid institution ID.
 */
export async function getInstitution(institutionId: string) {
  const client = getPlaidClient();
  const response = await client.institutionsGetById({
    institution_id: institutionId,
    country_codes: [CountryCode.Us],
  });
  return response.data.institution;
}
