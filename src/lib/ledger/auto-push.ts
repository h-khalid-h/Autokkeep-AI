// ============================================
// AUTO-PUSH TO LEDGER
// Automatically syncs approved transactions to
// QuickBooks or Xero via cron
// ============================================

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import type { LedgerProvider } from '@/lib/ledger/sync';
import {
  buildJournalEntryFromTransaction,
  syncJournalEntry,
} from '@/lib/ledger/sync';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface PushResult {
  pushed: number;
  failed: number;
  skipped: number;
  errors: Array<{ transactionId: string; error: string }>;
}

interface TransactionRow {
  id: string;
  entity_id: string;
  amount: number;
  merchant_name: string | null;
  date: string;
  category_human: string | null;
  category_ai: string | null;
}

interface LedgerConnectionRow {
  id: string;
  entity_id: string;
  provider: string;
  access_token: string;
  realm_id: string | null;
  tenant_id: string | null;
  bank_account_gl_code: string | null;
  status: string;
}

// ─── Core ───────────────────────────────────────────────────────────────────────

/**
 * Pushes all approved-but-unsynced transactions to their entity's ledger.
 *
 * Flow:
 * 1. Query transactions WHERE status='approved' AND ledger_synced=false
 * 2. Group by entity_id
 * 3. For each entity, find the active ledger_connection
 * 4. For each transaction, build a journal entry and sync it
 * 5. Mark success/failure on each row
 */
export async function pushApprovedTransactionsToLedger(
  supabase: SupabaseQueryClient
): Promise<PushResult> {
  const result: PushResult = { pushed: 0, failed: 0, skipped: 0, errors: [] };

  // 1. Fetch all approved, unsynced transactions
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('id, entity_id, amount, merchant_name, date, category_human, category_ai')
    .eq('status', 'approved')
    .eq('ledger_synced', false)
    .order('date', { ascending: true })
    .limit(500);

  if (txError) {
    throw new Error(`Failed to fetch unsynced transactions: ${txError.message}`);
  }

  if (!transactions || transactions.length === 0) {
    return result;
  }

  // 2. Group transactions by entity_id
  const byEntity = new Map<string, TransactionRow[]>();
  for (const tx of transactions as TransactionRow[]) {
    const existing = byEntity.get(tx.entity_id);
    if (existing) {
      existing.push(tx);
    } else {
      byEntity.set(tx.entity_id, [tx]);
    }
  }

  // 3. Fetch active ledger connections for all relevant entities
  const entityIds = [...byEntity.keys()];
  const { data: connections, error: connError } = await supabase
    .from('ledger_connections')
    .select('id, entity_id, provider, access_token, realm_id, tenant_id, bank_account_gl_code, status')
    .in('entity_id', entityIds)
    .eq('status', 'active');

  if (connError) {
    throw new Error(`Failed to fetch ledger connections: ${connError.message}`);
  }

  // Index connections by entity_id for O(1) lookup
  const connectionByEntity = new Map<string, LedgerConnectionRow>();
  for (const conn of (connections || []) as LedgerConnectionRow[]) {
    connectionByEntity.set(conn.entity_id, conn);
  }

  // 4. Process each entity's transactions
  for (const [entityId, entityTransactions] of byEntity) {
    const connection = connectionByEntity.get(entityId);

    if (!connection) {
      // No active ledger connection — skip all transactions for this entity
      result.skipped += entityTransactions.length;
      console.info(`[Auto-Push] Skipping ${entityTransactions.length} txns for entity ${entityId}: no active ledger connection`);
      continue;
    }

    const provider = connection.provider as LedgerProvider;
    const bankAccountGLCode = connection.bank_account_gl_code || '1000';

    for (const tx of entityTransactions) {
      try {
        // Build journal entry from transaction data
        const journalEntry = buildJournalEntryFromTransaction(
          {
            amount: tx.amount,
            merchant_name: tx.merchant_name || 'Unknown',
            date: tx.date,
            category_human: tx.category_human ?? undefined,
            category_ai: tx.category_ai ?? undefined,
            id: tx.id,
          },
          bankAccountGLCode
        );

        // Sync to external ledger
        const syncResult = await syncJournalEntry(provider, {
          accessToken: connection.access_token,
          realmId: connection.realm_id ?? undefined,
          tenantId: connection.tenant_id ?? undefined,
        }, journalEntry);

        if (syncResult.success) {
          // Mark as synced — CRITICAL: if this update fails, we risk
          // duplicate journal entries on the next cron run
          const { error: markError } = await supabase
            .from('transactions')
            .update({
              ledger_synced: true,
              ledger_synced_at: new Date().toISOString(),
              ledger_sync_error: null,
            })
            .eq('id', tx.id)
            .eq('ledger_synced', false); // Optimistic lock: only update if still unsynced

          if (markError) {
            // CRITICAL: Transaction was synced to external ledger but NOT marked locally
            // Next cron run will re-push, creating a DUPLICATE in QBO/Xero
            console.error(
              `[Auto-Push] CRITICAL: Transaction ${tx.id} synced to ${provider} ` +
              `(journal ${syncResult.journalEntryId}) but DB update failed: ${markError.message}. ` +
              `Manual reconciliation required.`
            );
            result.failed++;
            result.errors.push({ transactionId: tx.id, error: `Synced but mark-failed: ${markError.message}` });
          } else {
            result.pushed++;
          }
        } else {
          // Record sync error on the transaction row
          await supabase
            .from('transactions')
            .update({
              ledger_sync_error: syncResult.error || 'Unknown sync error',
            })
            .eq('id', tx.id);

          result.failed++;
          result.errors.push({ transactionId: tx.id, error: syncResult.error || 'Unknown sync error' });
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unexpected error';

        // Record error on the transaction row so it can be investigated
        await supabase
          .from('transactions')
          .update({
            ledger_sync_error: errorMessage,
          })
          .eq('id', tx.id);

        result.failed++;
        result.errors.push({ transactionId: tx.id, error: errorMessage });
        console.error(`[Auto-Push] Failed to sync transaction ${tx.id}:`, err);
      }
    }
  }

  console.info(`[Auto-Push] Complete: pushed=${result.pushed}, failed=${result.failed}, skipped=${result.skipped}`);
  return result;
}
