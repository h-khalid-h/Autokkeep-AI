import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseCSV,
  detectDateFormat,
  validateTransactionRow,
  importTransactions,
} from './csv-importer';

// ─── Mock Supabase ──────────────────────────────────────────────────────────────

function createMockDb(insertError: { message: string } | null = null) {
  const insertFn = vi.fn().mockResolvedValue({ error: insertError });

  return {
    db: {
      from: vi.fn().mockReturnValue({
        insert: insertFn,
      }),
    } as unknown as Parameters<typeof importTransactions>[0],
    insertFn,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('CSV Importer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // ── parseCSV ──────────────────────────────────────────────────────────────

  describe('parseCSV', () => {
    it('should parse a simple CSV string', () => {
      const csv = 'Date,Merchant,Amount\n2024-01-15,Coffee Shop,4.50\n2024-01-16,Amazon,99.99';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual(['Date', 'Merchant', 'Amount']);
      expect(rows[1]).toEqual(['2024-01-15', 'Coffee Shop', '4.50']);
      expect(rows[2]).toEqual(['2024-01-16', 'Amazon', '99.99']);
    });

    it('should handle quoted fields with commas', () => {
      const csv = 'Name,Value\n"Walmart, Inc.",100\n"Best Buy",200';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(3);
      expect(rows[1][0]).toBe('Walmart, Inc.');
    });

    it('should handle quoted fields with newlines', () => {
      const csv = 'Name,Notes\n"Vendor","Line 1\nLine 2"\nOther,Simple';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(3);
      expect(rows[1][1]).toBe('Line 1\nLine 2');
      expect(rows[2][0]).toBe('Other');
    });

    it('should handle escaped double quotes', () => {
      const csv = 'Name,Value\n"She said ""hello""",42';
      const rows = parseCSV(csv);

      expect(rows[1][0]).toBe('She said "hello"');
    });

    it('should strip BOM (byte order mark)', () => {
      const bom = '\uFEFF';
      const csv = `${bom}Date,Amount\n2024-01-01,10`;
      const rows = parseCSV(csv);

      expect(rows[0][0]).toBe('Date');
    });

    it('should handle Windows line endings (\\r\\n)', () => {
      const csv = 'A,B\r\n1,2\r\n3,4';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(3);
      expect(rows[1]).toEqual(['1', '2']);
    });

    it('should handle old Mac line endings (\\r)', () => {
      const csv = 'A,B\r1,2\r3,4';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(3);
    });

    it('should skip completely empty rows', () => {
      const csv = 'A,B\n1,2\n\n3,4';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(3); // header + 2 data rows (empty line skipped)
    });
  });

  // ── detectDateFormat ──────────────────────────────────────────────────────

  describe('detectDateFormat', () => {
    it('should detect MM/DD/YYYY format', () => {
      expect(detectDateFormat('01/15/2024')).toBe('MM/DD/YYYY');
      expect(detectDateFormat('12/31/2024')).toBe('MM/DD/YYYY');
    });

    it('should detect YYYY-MM-DD format', () => {
      expect(detectDateFormat('2024-01-15')).toBe('YYYY-MM-DD');
      expect(detectDateFormat('2024-12-31')).toBe('YYYY-MM-DD');
    });

    it('should detect DD/MM/YYYY when first part > 12', () => {
      expect(detectDateFormat('25/03/2024')).toBe('DD/MM/YYYY');
      expect(detectDateFormat('31/12/2024')).toBe('DD/MM/YYYY');
    });

    it('should default to MM/DD/YYYY for ambiguous dates', () => {
      // 01/02/2024 could be Jan 2 (US) or Feb 1 (EU), defaults to MM/DD/YYYY
      expect(detectDateFormat('01/02/2024')).toBe('MM/DD/YYYY');
    });

    it('should return unknown for unrecognized formats', () => {
      expect(detectDateFormat('not-a-date')).toBe('unknown');
      expect(detectDateFormat('2024')).toBe('unknown');
      expect(detectDateFormat('')).toBe('unknown');
    });
  });

  // ── validateTransactionRow ────────────────────────────────────────────────

  describe('validateTransactionRow', () => {
    it('should return no errors for a valid row', () => {
      const row = { Date: '2024-01-15', Merchant: 'Coffee Shop', Amount: '4.50' };
      const errors = validateTransactionRow(row, 2);
      expect(errors).toHaveLength(0);
    });

    it('should catch missing date', () => {
      const row = { Date: '', Merchant: 'Coffee Shop', Amount: '4.50' };
      const errors = validateTransactionRow(row, 2);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('date');
      expect(errors[0].message).toContain('required');
    });

    it('should catch invalid date format', () => {
      const row = { Date: 'not-a-date', Merchant: 'Shop', Amount: '10' };
      const errors = validateTransactionRow(row, 3);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('date');
      expect(errors[0].message).toContain('Invalid date');
    });

    it('should catch missing merchant', () => {
      const row = { Date: '2024-01-15', Merchant: '', Amount: '4.50' };
      const errors = validateTransactionRow(row, 2);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('merchant');
    });

    it('should catch missing amount', () => {
      const row = { Date: '2024-01-15', Merchant: 'Shop', Amount: '' };
      const errors = validateTransactionRow(row, 2);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('amount');
      expect(errors[0].message).toContain('required');
    });

    it('should catch invalid amount (non-numeric)', () => {
      const row = { Date: '2024-01-15', Merchant: 'Shop', Amount: 'abc' };
      const errors = validateTransactionRow(row, 2);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('amount');
      expect(errors[0].message).toContain('Invalid amount');
    });

    it('should accept amounts with currency symbols', () => {
      const row = { Date: '2024-01-15', Merchant: 'Shop', Amount: '$1,250.00' };
      const errors = validateTransactionRow(row, 2);
      expect(errors).toHaveLength(0);
    });

    it('should report multiple errors for a completely invalid row', () => {
      const row = { Date: '', Merchant: '', Amount: 'xyz' };
      const errors = validateTransactionRow(row, 5);
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── importTransactions ────────────────────────────────────────────────────

  describe('importTransactions', () => {
    it('should batch insert valid rows', async () => {
      const { db, insertFn } = createMockDb();

      const rows = [
        { Date: '2024-01-15', Merchant: 'Coffee Shop', Amount: '4.50', Category: '', Notes: '' },
        { Date: '2024-01-16', Merchant: 'Amazon', Amount: '99.99', Category: 'Office', Notes: 'Supplies' },
      ];

      const result = await importTransactions(db, 'entity-001', 'user-123', rows);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.success).toBe(true);
      // insertFn is called for transactions + audit_log
      expect(insertFn).toHaveBeenCalled();
    });

    it('should skip invalid rows and report errors', async () => {
      const { db } = createMockDb();

      const rows = [
        { Date: '2024-01-15', Merchant: 'Coffee Shop', Amount: '4.50', Category: '', Notes: '' },
        { Date: '', Merchant: '', Amount: 'abc', Category: '', Notes: '' }, // invalid
      ];

      const result = await importTransactions(db, 'entity-001', 'user-123', rows);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle all-invalid rows gracefully', async () => {
      const { db, insertFn } = createMockDb();

      const rows = [
        { Date: '', Merchant: '', Amount: '', Category: '', Notes: '' },
      ];

      const result = await importTransactions(db, 'entity-001', 'user-123', rows);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(insertFn).not.toHaveBeenCalled();
    });

    it('should handle database insert errors', async () => {
      const { db } = createMockDb({ message: 'Insert failed' });

      const rows = [
        { Date: '2024-01-15', Merchant: 'Shop', Amount: '10', Category: '', Notes: '' },
      ];

      const result = await importTransactions(db, 'entity-001', 'user-123', rows);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.success).toBe(false);
    });

    it('should handle empty input', async () => {
      const { db, insertFn } = createMockDb();

      const result = await importTransactions(db, 'entity-001', 'user-123', []);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(insertFn).not.toHaveBeenCalled();
    });
  });
});
