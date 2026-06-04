
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared Plaid Ingestion Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Consolidates the transaction sync → upsert → cursor update pipeline
// used across webhooks/plaid, plaid/sync, transactions/process, and cron/plaid-sync.

import { syncTransactions, type PlaidSyncResult } from '@/lib/plaid/client';
import { decryptToken } from '@/lib/crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BankConnection {
  id: string;
  entity_id: string;
  plaid_access_token: string;
  cursor?: string | null;
  [key: string]: unknown;
}

export interface IngestResult {
  added: number;
  modified: number;
  removed: number;
  cursor: string | null;
}

type SupabaseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// ─── Core Ingestion ─────────────────────────────────────────────────────────

/**
 * Sync transactions from Plaid and persist changes to the database.
 *
 * This is the single source of truth for:
 *   1. Upserting new transactions (status: 'pending')
 *   2. Resetting modified transactions for re-categorization
 *   3. Soft-deleting removed transactions
 *   4. Updating the cursor on the bank connection
 *
 * @param supabase – any Supabase client (user-scoped or admin)
 * @param connection – the bank_connections row (must include encrypted token)
 */
export async function ingestTransactions(
  supabase: SupabaseClient,
  connection: BankConnection,
): Promise<IngestResult> {
  // ── 1. Fetch changes from Plaid ───────────────────────────────────────
  const syncResult: PlaidSyncResult = await syncTransactions(
    decryptToken(connection.plaid_access_token),
    connection.cursor || undefined,
  );

  // Build Plaid account_id → DB bank_accounts.id mapping
  const { data: bankAccounts } = await supabase
    .from('bank_accounts')
    .select('id, plaid_account_id')
    .eq('connection_id', connection.id);

  const accountIdMap = new Map<string, string>();
  if (bankAccounts) {
    for (const ba of bankAccounts) {
      accountIdMap.set(ba.plaid_account_id, ba.id);
    }
  }

  const entityId = connection.entity_id;
  const result: IngestResult = {
    added: 0,
    modified: 0,
    removed: 0,
    cursor: syncResult.nextCursor,
  };

  // ── 2. Upsert new transactions ────────────────────────────────────────
  if (syncResult.added.length > 0) {
    const sevenYearsLater = new Date();
    sevenYearsLater.setFullYear(sevenYearsLater.getFullYear() + 7);
    const retentionDate = sevenYearsLater.toISOString().split('T')[0];

    const records = syncResult.added.map((t) => ({
      entity_id: entityId,
      bank_account_id: accountIdMap.get(t.account_id) || t.account_id,
      plaid_transaction_id: t.transaction_id,
      amount: t.amount,
      date: t.date,
      merchant_name: t.merchant_name || t.name,
      merchant_raw: t.name,
      currency: t.iso_currency_code || 'USD',
      status: 'pending',
      confidence: 0,
      retention_lock_until: retentionDate,
    }));

    const { error } = await supabase
      .from('transactions')
      .upsert(records, {
        onConflict: 'plaid_transaction_id',
        ignoreDuplicates: true,
      });

    if (!error) {
      result.added = syncResult.added.length;
    } else {
      console.error('[Plaid Ingest] Upsert error:', error.message);
    }
  }

  // ── 3. Reset modified transactions for AI re-categorization (batch) ──
  if (syncResult.modified.length > 0) {
    const now = new Date().toISOString();
    const modifiedRecords = syncResult.modified.map((t) => ({
      entity_id: entityId,
      bank_account_id: accountIdMap.get(t.account_id) || t.account_id,
      plaid_transaction_id: t.transaction_id,
      amount: t.amount,
      date: t.date,
      merchant_name: t.merchant_name || t.name,
      merchant_raw: t.name,
      category_ai: null,
      confidence: 0,
      ai_reasoning: null,
      status: 'pending',
      updated_at: now,
    }));

    const { error } = await supabase
      .from('transactions')
      .upsert(modifiedRecords, {
        onConflict: 'plaid_transaction_id',
      });

    if (!error) {
      result.modified = syncResult.modified.length;
    } else {
      console.error('[Plaid Ingest] Modified upsert error:', error.message);
    }
  }

  // ── 4. Soft-delete removed transactions (batch) ───────────────────────
  if (syncResult.removed.length > 0) {
    const removedIds = syncResult.removed.map(
      (t) => t.transaction_id,
    );
    const { error: removeError } = await supabase
      .from('transactions')
      .update({
        status: 'removed',
        updated_at: new Date().toISOString(),
      })
      .in('plaid_transaction_id', removedIds)
      .eq('entity_id', entityId);

    if (removeError) {
      console.error('[Plaid Ingest] Soft-delete error:', removeError.message);
    } else {
      result.removed = syncResult.removed.length;
    }
  }

  // ── 5. Update cursor on bank connection ───────────────────────────────
  const { error: cursorError } = await supabase
    .from('bank_connections')
    .update({
      cursor: syncResult.nextCursor,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  if (cursorError) {
    console.error('[Plaid Ingest] Cursor update error:', cursorError.message);
  }

  return result;
}
