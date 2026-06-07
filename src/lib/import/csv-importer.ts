
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — CSV Import Engine (Transaction Import)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Parses user-uploaded CSV files, validates each row, and batch-inserts
// transactions into Supabase with audit logging.

import { createLogger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const log = createLogger('csv-import');

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; field: string; message: string }>;
  warnings: Array<{ row: number; message: string }>;
}

export interface ParsedTransaction {
  date: string;
  merchantName: string;
  amount: number;
  category?: string;
  notes?: string;
}

// ─── CSV Parsing ────────────────────────────────────────────────────────────────

/**
 * Parses a raw CSV string into rows of string arrays.
 * Handles:
 *  - BOM (byte order mark) stripping
 *  - Quoted fields with embedded commas, newlines, and escaped quotes
 *  - Windows (\r\n) and Mac (\r) line endings
 */
export function parseCSV(csvString: string): string[][] {
  // Strip BOM
  let input = csvString;
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ""
        if (i + 1 < input.length && input[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
      } else if (char === '\r') {
        // Handle \r\n or standalone \r
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        if (i + 1 < input.length && input[i + 1] === '\n') {
          i += 2;
        } else {
          i++;
        }
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  // Push last field and row
  currentRow.push(currentField.trim());
  if (currentRow.some((f) => f.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

// ─── Date Detection & Parsing ───────────────────────────────────────────────────

export type DateFormat = 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'unknown';

/**
 * Auto-detects the date format of a given date string.
 *
 * Supported formats:
 *  - YYYY-MM-DD (ISO)
 *  - MM/DD/YYYY (US)
 *  - DD/MM/YYYY (EU — when first number > 12)
 */
export function detectDateFormat(dateStr: string): DateFormat {
  const trimmed = dateStr.trim();

  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    return 'YYYY-MM-DD';
  }

  // Slash-separated: MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const first = parseInt(slashMatch[1], 10);
    // If first number > 12, it must be a day → DD/MM/YYYY
    if (first > 12) {
      return 'DD/MM/YYYY';
    }
    // Default: MM/DD/YYYY
    return 'MM/DD/YYYY';
  }

  return 'unknown';
}

/**
 * Parses a date string to ISO YYYY-MM-DD, auto-detecting the format.
 */
function parseDateToISO(dateStr: string): string | null {
  const format = detectDateFormat(dateStr);
  const trimmed = dateStr.trim();

  switch (format) {
    case 'YYYY-MM-DD': {
      const [y, m, d] = trimmed.split('-').map(Number);
      if (isValidDate(y, m, d)) return formatISO(y, m, d);
      return null;
    }
    case 'MM/DD/YYYY': {
      const [m, d, y] = trimmed.split('/').map(Number);
      if (isValidDate(y, m, d)) return formatISO(y, m, d);
      return null;
    }
    case 'DD/MM/YYYY': {
      const [d, m, y] = trimmed.split('/').map(Number);
      if (isValidDate(y, m, d)) return formatISO(y, m, d);
      return null;
    }
    default:
      return null;
  }
}

function isValidDate(year: number, month: number, day: number): boolean {
  return year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function formatISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Row Validation ─────────────────────────────────────────────────────────────

/**
 * Validates a single parsed transaction row.
 * Returns an array of validation errors (empty if valid).
 */
export function validateTransactionRow(
  row: Record<string, string>,
  rowIndex: number
): Array<{ row: number; field: string; message: string }> {
  const errors: Array<{ row: number; field: string; message: string }> = [];

  // Date validation
  const dateVal = row['Date'] || row['date'] || '';
  if (!dateVal.trim()) {
    errors.push({ row: rowIndex, field: 'date', message: 'Date is required' });
  } else if (!parseDateToISO(dateVal)) {
    errors.push({ row: rowIndex, field: 'date', message: `Invalid date format: "${dateVal}"` });
  }

  // Merchant validation
  const merchant = row['Merchant'] || row['merchant'] || row['Merchant Name'] || '';
  if (!merchant.trim()) {
    errors.push({ row: rowIndex, field: 'merchant', message: 'Merchant name is required' });
  }

  // Amount validation
  const amountStr = row['Amount'] || row['amount'] || '';
  if (!amountStr.trim()) {
    errors.push({ row: rowIndex, field: 'amount', message: 'Amount is required' });
  } else {
    const cleaned = amountStr.replace(/[$€£¥₹,\s]/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      errors.push({ row: rowIndex, field: 'amount', message: `Invalid amount: "${amountStr}"` });
    }
  }

  return errors;
}

// ─── Batch Import ───────────────────────────────────────────────────────────────

/**
 * Batch-inserts parsed transaction rows into Supabase.
 * Validates each row, skips invalid ones, and returns an ImportResult summary.
 *
 * @param db - Supabase client
 * @param entityId - Target entity ID
 * @param userId - Actor user ID (for audit logging)
 * @param parsedRows - Array of parsed rows as key-value maps
 * @returns ImportResult with counts and errors
 */
export async function importTransactions(
  db: SupabaseQueryClient,
  entityId: string,
  userId: string,
  parsedRows: Array<Record<string, string>>
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    imported: 0,
    skipped: 0,
    errors: [],
    warnings: [],
  };

  const toInsert: Array<Record<string, unknown>> = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const rowIndex = i + 2; // +2 because row 1 is headers, data starts at row 2

    const validationErrors = validateTransactionRow(row, rowIndex);
    if (validationErrors.length > 0) {
      result.errors.push(...validationErrors);
      result.skipped++;
      continue;
    }

    const dateVal = row['Date'] || row['date'] || '';
    const merchant = row['Merchant'] || row['merchant'] || row['Merchant Name'] || '';
    const amountStr = row['Amount'] || row['amount'] || '';
    const category = row['Category'] || row['category'] || '';
    const notes = row['Notes'] || row['notes'] || '';

    const isoDate = parseDateToISO(dateVal);
    const cleanedAmount = amountStr.replace(/[$€£¥₹,\s]/g, '');
    const amount = parseFloat(cleanedAmount);

    toInsert.push({
      entity_id: entityId,
      date: isoDate,
      merchant_name: merchant.trim(),
      amount,
      category_ai: category.trim() || null,
      description: notes.trim() || null,
      status: 'pending',
    });
  }

  if (toInsert.length === 0) {
    result.success = result.errors.length === 0;
    return result;
  }

  // Batch insert in chunks of 500 to stay within Supabase limits
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await db.from('transactions').insert(batch);

    if (error) {
      log.error('Batch insert failed', {
        error: error.message,
        entityId,
        batchStart: i,
        batchSize: batch.length,
      });
      // Record error for remaining rows in this batch
      for (let j = 0; j < batch.length; j++) {
        result.errors.push({
          row: i + j + 2,
          field: 'batch',
          message: `Database insert failed: ${error.message}`,
        });
      }
      result.skipped += batch.length;
    } else {
      totalInserted += batch.length;
    }
  }

  result.imported = totalInserted;
  result.success = totalInserted > 0 && result.errors.length === 0;

  // Audit log the import
  try {
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: userId,
      actorType: 'human',
      action: 'create',
      targetType: 'transaction_import',
      details: {
        imported: totalInserted,
        skipped: result.skipped,
        errorCount: result.errors.length,
      },
    });
  } catch {
    // Audit logging is fire-and-forget
    log.warn('Failed to log import audit event');
  }

  log.info('Transaction import complete', {
    entityId,
    imported: totalInserted,
    skipped: result.skipped,
    errors: result.errors.length,
  });

  return result;
}
