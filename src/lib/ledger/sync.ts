// ============================================
// LEDGER SYNC ENGINE
// Bidirectional sync with QuickBooks & Xero
// ============================================

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

export type LedgerProvider = 'quickbooks' | 'xero';

// ============================================
// OAuth Helpers
// ============================================

export function getQBOAuthUrl(state: string): string {
  const clientId = process.env.QBO_CLIENT_ID;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error('Missing QBO OAuth config');

  // Intuit uses the same OAuth URL for both production and sandbox — environment is determined by realmId
  const baseUrl = 'https://appcenter.intuit.com/connect/oauth2';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  });

  return `${baseUrl}?${params.toString()}`;
}

export function getXeroAuthUrl(state: string): string {
  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error('Missing Xero OAuth config');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email accounting.transactions accounting.settings offline_access',
    state,
  });

  return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
}

// ============================================
// QuickBooks Token Exchange
// ============================================

export async function exchangeQBOCode(code: string, realmId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  realmId: string;
  expiresIn: number;
}> {
  const clientId = process.env.QBO_CLIENT_ID!;
  const clientSecret = process.env.QBO_CLIENT_SECRET!;
  const redirectUri = process.env.QBO_REDIRECT_URI!;

  // Intuit uses the same token URL for both production and sandbox
  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`QBO token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    realmId,
    expiresIn: data.expires_in,
  };
}

export async function refreshQBOToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const clientId = process.env.QBO_CLIENT_ID!;
  const clientSecret = process.env.QBO_CLIENT_SECRET!;

  const response = await fetch(
    'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    }
  );

  if (!response.ok) throw new Error('QBO token refresh failed');

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// ============================================
// Xero Token Exchange
// ============================================

export async function exchangeXeroCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  tenantName: string;
  tenantCount: number;
  expiresIn: number;
}> {
  const clientId = process.env.XERO_CLIENT_ID!;
  const clientSecret = process.env.XERO_CLIENT_SECRET!;
  const redirectUri = process.env.XERO_REDIRECT_URI!;

  const response = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) throw new Error('Xero token exchange failed');

  const data = await response.json();

  // Get tenant connections
  const connectionsRes = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });

  const connections = await connectionsRes.json();

  if (!Array.isArray(connections) || connections.length === 0) {
    throw new Error('No Xero organizations found. The user must have at least one Xero org.');
  }

  // Log warning for multi-tenant accounts — operator awareness
  if (connections.length > 1) {
    console.warn(
      `[Xero Auth] Account has ${connections.length} organizations. Auto-selecting first: ` +
      `"${connections[0]?.tenantName}" (${connections[0]?.tenantId}). ` +
      `Other orgs: ${connections.slice(1).map((c: { tenantName: string }) => c.tenantName).join(', ')}`
    );
  }

  const selectedTenant = connections[0];

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tenantId: selectedTenant.tenantId,
    tenantName: selectedTenant.tenantName || 'Unknown',
    tenantCount: connections.length,
    expiresIn: data.expires_in,
  };
}

export async function refreshXeroToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const clientId = process.env.XERO_CLIENT_ID!;
  const clientSecret = process.env.XERO_CLIENT_SECRET!;

  const response = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) throw new Error('Xero token refresh failed');

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// ============================================
// QuickBooks API Operations
// ============================================

interface QBORequestOptions {
  accessToken: string;
  realmId: string;
}

function getQBOBaseUrl(realmId: string): string {
  const isProduction = process.env.QBO_ENVIRONMENT === 'production';
  const base = isProduction
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
  return `${base}/v3/company/${realmId}`;
}

export async function getQBOChartOfAccounts(
  options: QBORequestOptions
): Promise<Array<{ id: string; name: string; accountType: string; accountNumber: string }>> {
  const baseUrl = getQBOBaseUrl(options.realmId);
  const query = encodeURIComponent("SELECT * FROM Account WHERE Active = true MAXRESULTS 200");

  const response = await fetch(`${baseUrl}/query?query=${query}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) throw new Error('Failed to fetch QBO chart of accounts');

  const data = await response.json();
  const accounts = data.QueryResponse?.Account || [];

  return accounts.map((acc: Record<string, string>) => ({
    id: acc.Id,
    name: acc.Name,
    accountType: acc.AccountType,
    accountNumber: acc.AcctNum || '',
  }));
}

export interface JournalEntryData {
  date: string;
  memo: string;
  lines: Array<{
    glCode: string;
    glName: string;
    debit: number;
    credit: number;
    description: string;
  }>;
}

export async function createQBOJournalEntry(
  options: QBORequestOptions,
  entry: JournalEntryData
): Promise<{ id: string; docNumber: string }> {
  const baseUrl = getQBOBaseUrl(options.realmId);

  // F34: Validate no line has both debit and credit positive
  for (const line of entry.lines) {
    if (line.debit > 0 && line.credit > 0) {
      throw new Error(`Invalid journal line: both debit (${line.debit}) and credit (${line.credit}) are positive`);
    }
  }

  const qboEntry = {
    TxnDate: entry.date,
    PrivateNote: entry.memo,
    Line: entry.lines.map((line) => ({
      DetailType: 'JournalEntryLineDetail',
      Amount: line.debit > 0 ? line.debit : line.credit,
      Description: line.description,
      JournalEntryLineDetail: {
        PostingType: line.debit > 0 ? 'Debit' : 'Credit',
        AccountRef: {
          value: line.glCode,
          name: line.glName || undefined,
        },
      },
    })),
  };

  const response = await fetch(`${baseUrl}/journalentry`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(qboEntry),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`QBO journal entry creation failed: ${error}`);
  }

  const data = await response.json();

  return {
    id: data.JournalEntry?.Id || '',
    docNumber: data.JournalEntry?.DocNumber || '',
  };
}

// ============================================
// Xero API Operations
// ============================================

interface XeroRequestOptions {
  accessToken: string;
  tenantId: string;
}

export async function getXeroChartOfAccounts(
  options: XeroRequestOptions
): Promise<Array<{ id: string; name: string; type: string; code: string }>> {
  const response = await fetch('https://api.xero.com/api.xro/2.0/Accounts', {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Xero-Tenant-Id': options.tenantId,
      Accept: 'application/json',
    },
  });

  if (!response.ok) throw new Error('Failed to fetch Xero chart of accounts');

  const data = await response.json();
  const accounts = data.Accounts || [];

  return accounts.map((acc: Record<string, string>) => ({
    id: acc.AccountID,
    name: acc.Name,
    type: acc.Type,
    code: acc.Code || '',
  }));
}

export async function createXeroJournalEntry(
  options: XeroRequestOptions,
  entry: JournalEntryData
): Promise<{ id: string }> {
  const xeroEntry = {
    ManualJournals: [
      {
        Narration: entry.memo,
        Date: entry.date,
        JournalLines: entry.lines.map((line) => ({
          LineAmount: line.debit > 0 ? line.debit : -line.credit,
          AccountCode: line.glCode,
          Description: line.description,
        })),
      },
    ],
  };

  const response = await fetch('https://api.xero.com/api.xro/2.0/ManualJournals', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Xero-Tenant-Id': options.tenantId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(xeroEntry),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Xero journal entry creation failed: ${error}`);
  }

  const data = await response.json();

  return {
    id: data.ManualJournals?.[0]?.ManualJournalID || '',
  };
}

// ============================================
// Unified Ledger Sync Engine
// ============================================

export interface LedgerSyncResult {
  provider: LedgerProvider;
  journalEntryId: string;
  docNumber?: string;
  success: boolean;
  error?: string;
}

export async function syncJournalEntry(
  provider: LedgerProvider,
  credentials: {
    accessToken: string;
    realmId?: string;
    tenantId?: string;
  },
  entry: JournalEntryData
): Promise<LedgerSyncResult> {
  try {
    if (provider === 'quickbooks') {
      if (!credentials.realmId) {
        return { provider, journalEntryId: '', success: false, error: 'Missing QBO realmId' };
      }

      const result = await createQBOJournalEntry(
        { accessToken: credentials.accessToken, realmId: credentials.realmId },
        entry
      );

      return {
        provider,
        journalEntryId: result.id,
        docNumber: result.docNumber,
        success: true,
      };
    }

    if (provider === 'xero') {
      if (!credentials.tenantId) {
        return { provider, journalEntryId: '', success: false, error: 'Missing Xero tenantId' };
      }

      const result = await createXeroJournalEntry(
        { accessToken: credentials.accessToken, tenantId: credentials.tenantId },
        entry
      );

      return {
        provider,
        journalEntryId: result.id,
        success: true,
      };
    }

    return { provider, journalEntryId: '', success: false, error: 'Unknown provider' };
  } catch (error) {
    return {
      provider,
      journalEntryId: '',
      success: false,
      error: error instanceof Error ? error.message : 'Sync failed',
    };
  }
}

// ============================================
// Chart of Accounts Sync
// Pull CoA from ledger into Autokkeep
// ============================================

export async function syncChartOfAccounts(
  provider: LedgerProvider,
  credentials: {
    accessToken: string;
    realmId?: string;
    tenantId?: string;
  }
): Promise<Array<{ code: string; name: string; type: string; externalId: string }>> {
  if (provider === 'quickbooks' && credentials.realmId) {
    const accounts = await getQBOChartOfAccounts({
      accessToken: credentials.accessToken,
      realmId: credentials.realmId,
    });

    return accounts.map((acc) => ({
      code: acc.accountNumber || acc.id,
      name: acc.name,
      type: mapQBOAccountType(acc.accountType),
      externalId: acc.id,
    }));
  }

  if (provider === 'xero' && credentials.tenantId) {
    const accounts = await getXeroChartOfAccounts({
      accessToken: credentials.accessToken,
      tenantId: credentials.tenantId,
    });

    return accounts.map((acc) => ({
      code: acc.code || acc.id,
      name: acc.name,
      type: mapXeroAccountType(acc.type),
      externalId: acc.id,
    }));
  }

  return [];
}

/**
 * Batch upsert chart of accounts into the database.
 * Replaces one-by-one upserts in QBO/Xero sync routes with a single batched call.
 */
export async function upsertChartOfAccounts(
  db: SupabaseQueryClient,
  entityId: string,
  accounts: Array<{ code: string; name: string; type: string; externalId: string }>
): Promise<{ upserted: number; errors: number }> {
  if (accounts.length === 0) return { upserted: 0, errors: 0 };

  const rows = accounts.map((acc) => ({
    entity_id: entityId,
    code: acc.code,
    name: acc.name,
    type: acc.type as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
    external_id: acc.externalId,
    is_active: true,
  }));

  const { error, count } = await db
    .from('chart_of_accounts')
    .upsert(rows, { onConflict: 'entity_id,code', count: 'exact' });

  if (error) {
    console.error('[Ledger Sync] Batch CoA upsert failed:', error.message);
    return { upserted: 0, errors: accounts.length };
  }

  return { upserted: count ?? accounts.length, errors: 0 };
}

function mapQBOAccountType(type: string): string {
  const mapping: Record<string, string> = {
    Bank: 'asset',
    'Accounts Receivable': 'asset',
    'Other Current Asset': 'asset',
    'Fixed Asset': 'asset',
    'Other Asset': 'asset',
    'Accounts Payable': 'liability',
    'Credit Card': 'liability',
    'Other Current Liability': 'liability',
    'Long Term Liability': 'liability',
    Equity: 'equity',
    Income: 'revenue',
    'Other Income': 'revenue',
    Expense: 'expense',
    'Other Expense': 'expense',
    'Cost of Goods Sold': 'expense',
  };

  return mapping[type] || 'expense';
}

function mapXeroAccountType(type: string): string {
  const mapping: Record<string, string> = {
    BANK: 'asset',
    CURRENT: 'asset',
    CURRLIAB: 'liability',
    TERMLIAB: 'liability',
    FIXED: 'asset',
    EQUITY: 'equity',
    REVENUE: 'revenue',
    DIRECTCOSTS: 'expense',
    OVERHEADS: 'expense',
    OTHERINCOME: 'revenue',
    EXPENSE: 'expense',
  };

  return mapping[type] || 'expense';
}

// ============================================
// Build Journal Entry from Transaction
// ============================================

export function buildJournalEntryFromTransaction(
  transaction: {
    amount: number;
    merchant_name: string;
    date: string;
    category_human?: string;
    category_ai?: string;
    id: string;
  },
  bankAccountGLCode: string,
  defaultExpenseGLCode: string = '6510'
): JournalEntryData {
  // F35: Zero-amount guard
  if (transaction.amount === 0) {
    throw new Error('Cannot build journal entry for zero-amount transaction');
  }

  const glCode = transaction.category_human || transaction.category_ai || defaultExpenseGLCode;
  const isExpense = transaction.amount > 0;

  return {
    date: transaction.date,
    memo: `Autokkeep auto-posted: ${transaction.merchant_name} (${transaction.id})`,
    lines: [
      {
        glCode: isExpense ? glCode : bankAccountGLCode,
        glName: '',
        debit: isExpense ? Math.abs(transaction.amount) : 0,
        credit: isExpense ? 0 : Math.abs(transaction.amount),
        description: transaction.merchant_name,
      },
      {
        glCode: isExpense ? bankAccountGLCode : glCode,
        glName: '',
        debit: isExpense ? 0 : Math.abs(transaction.amount),
        credit: isExpense ? Math.abs(transaction.amount) : 0,
        description: transaction.merchant_name,
      },
    ],
  };
}
