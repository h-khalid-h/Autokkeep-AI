/**
 * Ledger Sync Engine — Nightly Bulk Sync to QBO/Xero
 * 
 * PRD §3.3: The Universal General Ledger Adapter
 * 
 * Compiles approved journal entries into batches and pushes them to
 * downstream ERPs via scheduled bulk API transfers. If API is unavailable,
 * falls back to CSV/SQL export automatically.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { syncJournalEntry, type JournalEntryData } from './sync';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SyncResult {
  entityId: string;
  entityName: string;
  provider: 'quickbooks' | 'xero' | 'none';
  attempted: number;
  synced: number;
  failed: number;
  fallbackExport: boolean;
  errors: string[];
}

interface JournalEntryForSync {
  id: string;
  entity_id: string;
  entry_date: string;
  memo: string | null;
  status: string;
  lines: Array<{
    gl_code: string;
    debit: number;
    credit: number;
    description: string | null;
  }>;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ─── Core Functions ─────────────────────────────────────────────────────────────

/**
 * Fetch all approved (unsynced) journal entries for an entity.
 */
async function getUnsyncedEntries(
  db: SupabaseQueryClient,
  entityId: string,
): Promise<JournalEntryForSync[]> {
  const { data: entries, error } = await db
    .from('journal_entries')
    .select(`
      id,
      entity_id,
      entry_date,
      memo,
      status,
      journal_lines (
        gl_code,
        debit,
        credit,
        description
      )
    `)
    .eq('entity_id', entityId)
    .eq('status', 'posted')
    .is('ledger_sync_id', null)
    .order('entry_date', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error(`[Sync Engine] Failed to fetch entries for ${entityId}:`, error);
    return [];
  }

  return (entries || []).map((e: Record<string, unknown>) => ({
    id: e.id as string,
    entity_id: e.entity_id as string,
    entry_date: e.entry_date as string,
    memo: e.memo as string | null,
    status: e.status as string,
    lines: (e.journal_lines as Array<Record<string, unknown>> || []).map(l => ({
      gl_code: l.gl_code as string,
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      description: l.description as string | null,
    })),
  }));
}

/**
 * Get the ledger connection for an entity (QBO or Xero).
 */
async function getLedgerConnection(db: SupabaseQueryClient, entityId: string) {
  const { data } = await db
    .from('ledger_connections')
    .select('*')
    .eq('entity_id', entityId)
    .eq('is_active', true)
    .single();

  return data;
}

/**
 * Mark entries as synced in the database.
 * Uses optimistic locking (WHERE ledger_sync_id IS NULL) to prevent TOCTOU races.
 */
async function markEntriesSynced(
  db: SupabaseQueryClient,
  entryIds: string[],
  syncId: string,
  provider: string,
): Promise<void> {
  await db
    .from('journal_entries')
    .update({
      ledger_sync_id: syncId,
      ledger_type: provider,
    })
    .in('id', entryIds)
    .is('ledger_sync_id', null); // Optimistic lock: only update if not already synced
}

/**
 * Mark a single entry as failed with an error message.
 */
async function markEntryFailed(
  db: SupabaseQueryClient,
  entryId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .from('journal_entries')
    .update({
      sync_status: 'failed',
      sync_error: errorMessage,
    })
    .eq('id', entryId);
}

/**
 * Retry an async operation with exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[Sync Engine] Retry ${attempt}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Sync a batch of journal entries to a downstream provider.
 * Returns the count of successfully synced entries.
 */
async function syncBatchToProvider(
  db: SupabaseQueryClient,
  entries: JournalEntryForSync[],
  provider: 'quickbooks' | 'xero',
  _connection: Record<string, unknown>,
): Promise<{ synced: string[]; failed: string[]; errors: string[] }> {
  const synced: string[] = [];
  const failed: string[] = [];
  const errors: string[] = [];

  const credentials = {
    accessToken: _connection.access_token as string,
    realmId: _connection.realm_id as string | undefined,
    tenantId: _connection.tenant_id as string | undefined,
  };

  for (const entry of entries) {
    // Before syncing each entry, verify double-entry balance
    const totalDebits = entry.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredits = entry.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
    // Allow tiny floating point variance (< 1 cent)
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      console.error(`[Sync Engine] Unbalanced journal entry ${entry.id}: debits=${totalDebits} credits=${totalCredits}`);
      // Mark as failed rather than sending unbalanced entry
      await markEntryFailed(db, entry.id, `Unbalanced: debits=${totalDebits} credits=${totalCredits}`);
      errors.push(`Entry ${entry.id}: Unbalanced (debits=${totalDebits}, credits=${totalCredits})`);
      failed.push(entry.id);
      continue; // Skip this entry
    }

    try {
      // Build JournalEntryData from the internal entry format
      const entryData: JournalEntryData = {
        date: entry.entry_date,
        memo: entry.memo || `Autokkeep sync: ${entry.id}`,
        lines: entry.lines.map((line) => ({
          glCode: line.gl_code,
          glName: '',
          debit: line.debit,
          credit: line.credit,
          description: line.description || '',
        })),
      };

      // Attempt sync via the real ledger adapter
      const result = await withRetry(async () => {
        const syncResult = await syncJournalEntry(provider, credentials, entryData);
        if (!syncResult.success) {
          throw new Error(syncResult.error || `${provider} sync failed`);
        }
        return syncResult;
      });

      if (result.success) {
        synced.push(entry.id);
      } else {
        errors.push(`Entry ${entry.id}: ${result.error}`);
        failed.push(entry.id);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Entry ${entry.id}: ${msg}`);
      failed.push(entry.id);
    }
  }

  return { synced, failed, errors };
}

/**
 * Run the nightly sync for all entities with active ledger connections.
 * 
 * For each entity:
 * 1. Check if a ledger connection exists
 * 2. Fetch unsynced posted journal entries
 * 3. Attempt bulk API sync
 * 4. If API fails, flag for CSV export fallback
 */
export async function runNightlySync(): Promise<SyncResult[]> {
  const supabase = createAdminClient();
  const db = supabase as unknown as SupabaseQueryClient;
  const results: SyncResult[] = [];

  // Get all entities with active ledger connections
  const { data: connections } = await db
    .from('ledger_connections')
    .select('entity_id, provider, entities(name)')
    .eq('is_active', true);

  if (!connections || connections.length === 0) {
    console.info('[Sync Engine] No active ledger connections found.');
    return [];
  }

  for (const conn of connections) {
    const entityId = conn.entity_id as string;
    const provider = conn.provider as 'quickbooks' | 'xero';
    const entities = conn.entities as unknown as { name: string } | { name: string }[] | null;
    const entityName = Array.isArray(entities) ? entities[0]?.name : entities?.name || entityId;

    console.info(`[Sync Engine] Processing entity: ${entityName} (${provider})`);

    const entries = await getUnsyncedEntries(db, entityId);

    if (entries.length === 0) {
      results.push({
        entityId,
        entityName,
        provider,
        attempted: 0,
        synced: 0,
        failed: 0,
        fallbackExport: false,
        errors: [],
      });
      continue;
    }

    const connection = await getLedgerConnection(db, entityId);
    if (!connection) {
      results.push({
        entityId,
        entityName,
        provider,
        attempted: entries.length,
        synced: 0,
        failed: entries.length,
        fallbackExport: true,
        errors: ['No active ledger connection found'],
      });
      continue;
    }

    const { synced, failed, errors } = await syncBatchToProvider(
      db,
      entries,
      provider,
      connection as Record<string, unknown>,
    );

    // Mark synced entries
    if (synced.length > 0) {
      const syncId = `nightly_${new Date().toISOString().split('T')[0]}_${entityId.slice(0, 8)}`;
      await markEntriesSynced(db, synced, syncId, provider);
    }

    results.push({
      entityId,
      entityName,
      provider,
      attempted: entries.length,
      synced: synced.length,
      failed: failed.length,
      fallbackExport: failed.length > 0 && synced.length === 0,
      errors,
    });

    // Update last_synced_at on the connection
    await db
      .from('ledger_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('entity_id', entityId)
      .eq('provider', provider);
  }

  return results;
}
