
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — CSV Export Generator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Generates downloadable CSV strings for transactions, chart-of-accounts,
// and audit log data. Uses proper RFC 4180 escaping.

import { createLogger } from '@/lib/logger';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const log = createLogger('csv-export');

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ExportConfig {
  entityId: string;
  type: 'transactions' | 'chart-of-accounts' | 'audit-log';
  filters?: {
    startDate?: string;
    endDate?: string;
    status?: string;
    category?: string;
  };
  format: 'csv';
}

export type ExportType = ExportConfig['type'];

// ─── CSV Utilities ──────────────────────────────────────────────────────────────

/**
 * Escapes a value for CSV output per RFC 4180.
 * Wraps in double-quotes if the value contains commas, quotes, or newlines.
 * Internal double-quotes are escaped by doubling them.
 */
export function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';

  const str = String(value);

  // If the value contains comma, double-quote, newline, or carriage return, wrap it
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Converts an array of row arrays into a CSV string.
 */
function toCsvString(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map((row) => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
}

// ─── Transaction Export ─────────────────────────────────────────────────────────

/**
 * Generates a CSV string of transactions for the given entity.
 *
 * Columns: Date, Merchant, Amount, Category, Status, Notes
 */
export async function generateTransactionsCsv(
  db: SupabaseQueryClient,
  entityId: string,
  filters?: ExportConfig['filters']
): Promise<string> {
  let query = db
    .from('transactions')
    .select('date, merchant_name, amount, category_ai, category_human, status, description')
    .eq('entity_id', entityId)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (filters?.startDate) {
    query = query.gte('date', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('date', filters.endDate);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.category) {
    query = query.or(`category_ai.eq.${filters.category},category_human.eq.${filters.category}`);
  }

  const { data, error } = await query.limit(50000);

  if (error) {
    log.error('Failed to fetch transactions for export', { error: error.message, entityId });
    throw new Error(`Failed to export transactions: ${error.message}`);
  }

  const headers = ['Date', 'Merchant', 'Amount', 'Category', 'Status', 'Notes'];

  if (!data || data.length === 0) {
    return toCsvString(headers, []);
  }

  const rows = data.map((t: Record<string, unknown>) => [
    String(t.date ?? ''),
    String(t.merchant_name ?? ''),
    String(t.amount ?? ''),
    String(t.category_human ?? t.category_ai ?? ''),
    String(t.status ?? ''),
    String(t.description ?? ''),
  ]);

  log.info('Transactions CSV generated', { entityId, rowCount: rows.length });
  return toCsvString(headers, rows);
}

// ─── Chart of Accounts Export ───────────────────────────────────────────────────

/**
 * Generates a CSV string of the chart of accounts for the given entity.
 *
 * Columns: Code, Name, Type, Active
 */
export async function generateChartOfAccountsCsv(
  db: SupabaseQueryClient,
  entityId: string
): Promise<string> {
  const { data, error } = await db
    .from('chart_of_accounts')
    .select('code, name, type, is_active')
    .eq('entity_id', entityId)
    .order('code', { ascending: true });

  if (error) {
    log.error('Failed to fetch chart of accounts for export', { error: error.message, entityId });
    throw new Error(`Failed to export chart of accounts: ${error.message}`);
  }

  const headers = ['Code', 'Name', 'Type', 'Active'];

  if (!data || data.length === 0) {
    return toCsvString(headers, []);
  }

  const rows = data.map((a: Record<string, unknown>) => [
    String(a.code ?? ''),
    String(a.name ?? ''),
    String(a.type ?? ''),
    String(a.is_active ?? ''),
  ]);

  log.info('Chart of accounts CSV generated', { entityId, rowCount: rows.length });
  return toCsvString(headers, rows);
}

// ─── Audit Log Export ───────────────────────────────────────────────────────────

/**
 * Generates a CSV string of audit log entries for the given entity.
 *
 * Columns: Timestamp, User, Action, Resource, Details
 */
export async function generateAuditLogCsv(
  db: SupabaseQueryClient,
  entityId: string,
  filters?: ExportConfig['filters']
): Promise<string> {
  let query = db
    .from('audit_log')
    .select('created_at, actor_id, action, target_type, details')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });

  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('created_at', filters.endDate);
  }

  const { data, error } = await query.limit(50000);

  if (error) {
    log.error('Failed to fetch audit log for export', { error: error.message, entityId });
    throw new Error(`Failed to export audit log: ${error.message}`);
  }

  const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Details'];

  if (!data || data.length === 0) {
    return toCsvString(headers, []);
  }

  const rows = data.map((entry: Record<string, unknown>) => [
    String(entry.created_at ?? ''),
    String(entry.actor_id ?? ''),
    String(entry.action ?? ''),
    String(entry.target_type ?? ''),
    entry.details ? JSON.stringify(entry.details) : '',
  ]);

  log.info('Audit log CSV generated', { entityId, rowCount: rows.length });
  return toCsvString(headers, rows);
}
