// ============================================
// LEDGER CSV / SQL EXPORT ENGINE
// Accounting-compliant journal entry exports
// ============================================

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// --- Types ---

export interface ExportOptions {
  startDate?: string;
  endDate?: string;
  status?: string; // 'draft' | 'posted' | 'voided' or comma-separated
}

interface JournalEntryRow {
  id: string;
  entry_date: string;
  memo: string | null;
  status: string;
  posted_at: string | null;
  journal_lines: JournalLineRow[];
}

interface JournalLineRow {
  id: string;
  gl_code: string;
  debit: number;
  credit: number;
  description: string | null;
  journal_entry_id: string;
}

interface FlatExportRow {
  date: string;
  entryNumber: string;
  accountName: string;
  description: string;
  debit: string;
  credit: string;
  status: string;
}

// --- Helpers ---

function escapeCsv(val: string | null | undefined): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Prevent CSV formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatAmount(amount: number): string {
  return amount === 0 ? '' : amount.toFixed(2);
}

function escapeSQL(val: string): string {
  return val.replace(/'/g, "''");
}

// --- Query ---

async function queryJournalEntries(
  supabase: SupabaseQueryClient,
  entityId: string,
  options: ExportOptions
): Promise<JournalEntryRow[]> {
  let query = supabase
    .from('journal_entries')
    .select(`
      id,
      entry_date,
      memo,
      status,
      posted_at,
      journal_lines (
        id,
        gl_code,
        debit,
        credit,
        description,
        journal_entry_id
      )
    `)
    .eq('entity_id', entityId)
    .order('entry_date', { ascending: true });

  if (options.startDate) {
    query = query.gte('entry_date', options.startDate);
  }

  if (options.endDate) {
    query = query.lte('entry_date', options.endDate);
  }

  if (options.status) {
    const statuses = options.status.split(',').map((s) => s.trim());
    if (statuses.length === 1) {
      query = query.eq('status', statuses[0]);
    } else {
      query = query.in('status', statuses);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to query journal entries: ${error.message}`);
  }

  return (data || []) as JournalEntryRow[];
}

function flattenEntries(entries: JournalEntryRow[]): FlatExportRow[] {
  const rows: FlatExportRow[] = [];

  for (const entry of entries) {
    const lines = entry.journal_lines || [];
    for (const line of lines) {
      rows.push({
        date: entry.entry_date,
        entryNumber: entry.id.slice(0, 8).toUpperCase(),
        accountName: line.gl_code,
        description: line.description || entry.memo || '',
        debit: formatAmount(line.debit ?? 0),
        credit: formatAmount(line.credit ?? 0),
        status: entry.status,
      });
    }
  }

  return rows;
}

// --- Public API ---

/**
 * Exports journal entries as accounting-compliant CSV.
 * Columns: Date, EntryNumber, AccountName, Description, Debit, Credit, Status
 */
export async function exportToCSV(
  supabase: SupabaseQueryClient,
  entityId: string,
  options: ExportOptions = {}
): Promise<string> {
  const entries = await queryJournalEntries(supabase, entityId, options);
  const rows = flattenEntries(entries);

  const header = 'Date,EntryNumber,AccountName,Description,Debit,Credit,Status';
  const csvRows = rows.map((r) =>
    [
      escapeCsv(r.date),
      escapeCsv(r.entryNumber),
      escapeCsv(r.accountName),
      escapeCsv(r.description),
      escapeCsv(r.debit),
      escapeCsv(r.credit),
      escapeCsv(r.status),
    ].join(',')
  );

  return [header, ...csvRows].join('\n');
}

/**
 * Exports journal entries as SQL INSERT statements.
 * Useful for data migration and backup.
 */
export async function exportToSQL(
  supabase: SupabaseQueryClient,
  entityId: string,
  options: ExportOptions = {}
): Promise<string> {
  const entries = await queryJournalEntries(supabase, entityId, options);

  const statements: string[] = [
    '-- Autokkeep Journal Entry Export',
    `-- Entity: ${entityId}`,
    `-- Generated: ${new Date().toISOString()}`,
    '',
    'BEGIN;',
    '',
  ];

  for (const entry of entries) {
    statements.push(
      `INSERT INTO journal_entries (id, entity_id, entry_date, memo, status, posted_at)`,
      `VALUES ('${escapeSQL(entry.id)}', '${escapeSQL(entityId)}', '${escapeSQL(entry.entry_date)}', '${escapeSQL(entry.memo || '')}', '${escapeSQL(entry.status)}', ${entry.posted_at ? `'${escapeSQL(entry.posted_at)}'` : 'NULL'});`,
      ''
    );

    for (const line of entry.journal_lines || []) {
      statements.push(
        `INSERT INTO journal_lines (id, journal_entry_id, gl_code, debit, credit, description)`,
        `VALUES ('${escapeSQL(line.id)}', '${escapeSQL(line.journal_entry_id)}', '${escapeSQL(line.gl_code)}', ${line.debit ?? 0}, ${line.credit ?? 0}, '${escapeSQL(line.description || '')}');`
      );
    }

    statements.push('');
  }

  statements.push('COMMIT;', '');

  return statements.join('\n');
}
