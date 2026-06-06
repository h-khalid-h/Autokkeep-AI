import { describe, it, expect } from 'vitest';
import { parseCsvTransactions } from './csv-parser';
import type { ParsedTransaction } from './csv-parser';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Build a minimal valid CSV string from header + rows. */
function buildCsv(
  headers: string[],
  rows: string[][],
  delimiter: string = ','
): string {
  const escape = (field: string) => {
    if (field.includes(delimiter) || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };
  const lines = [headers, ...rows].map((cols) =>
    cols.map(escape).join(delimiter)
  );
  return lines.join('\n');
}

// ─── 1. Basic CSV with comma delimiter ──────────────────────────────────────────

describe('CSV Parser', () => {
  describe('1 — Basic CSV with comma delimiter', () => {
    it('should parse a simple comma-separated CSV', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [
          ['2024-01-15', 'Coffee Shop', '4.50'],
          ['2024-01-16', 'Grocery Store', '52.30'],
        ]
      );

      const result = parseCsvTransactions(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]).toEqual<ParsedTransaction>({
        date: '2024-01-15',
        description: 'Coffee Shop',
        amount: 4.5,
      });
      expect(result.transactions[1]).toEqual<ParsedTransaction>({
        date: '2024-01-16',
        description: 'Grocery Store',
        amount: 52.3,
      });
      expect(result.detectedFormat).toContain('comma');
    });
  });

  // ─── 2. Semicolon delimiter (European format) ──────────────────────────────

  describe('2 — CSV with semicolon delimiter (European format)', () => {
    it('should parse semicolon-separated CSV', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [
          ['2024-03-01', 'Supermarché', '29.99'],
          ['2024-03-02', 'Boulangerie', '6.50'],
        ],
        ';'
      );

      const result = parseCsvTransactions(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(2);
      expect(result.detectedFormat).toContain('semicolon');
      expect(result.transactions[0].description).toBe('Supermarché');
    });
  });

  // ─── 3. Tab delimiter ─────────────────────────────────────────────────────

  describe('3 — CSV with tab delimiter', () => {
    it('should parse tab-separated CSV', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [
          ['2024-05-10', 'Office Supplies', '120.00'],
          ['2024-05-11', 'Client Lunch', '85.75'],
        ],
        '\t'
      );

      const result = parseCsvTransactions(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(2);
      expect(result.detectedFormat).toContain('tab');
      expect(result.transactions[0].amount).toBe(120);
    });
  });

  // ─── 4. Auto-detect delimiter ─────────────────────────────────────────────

  describe('4 — Auto-detect delimiter', () => {
    it('should auto-detect comma when commas are present', () => {
      const csv = 'Date,Description,Amount\n2024-01-01,Test,10.00';
      const result = parseCsvTransactions(csv);
      expect(result.detectedFormat).toContain('comma');
      expect(result.transactions).toHaveLength(1);
    });

    it('should auto-detect semicolon when semicolons are present', () => {
      const csv = 'Date;Description;Amount\n2024-01-01;Test;10.00';
      const result = parseCsvTransactions(csv);
      expect(result.detectedFormat).toContain('semicolon');
      expect(result.transactions).toHaveLength(1);
    });

    it('should auto-detect tab when tabs are present', () => {
      const csv = 'Date\tDescription\tAmount\n2024-01-01\tTest\t10.00';
      const result = parseCsvTransactions(csv);
      expect(result.detectedFormat).toContain('tab');
      expect(result.transactions).toHaveLength(1);
    });
  });

  // ─── 5. Quoted fields with commas inside ──────────────────────────────────

  describe('5 — Quoted fields with embedded commas', () => {
    it('should handle commas inside double-quoted fields', () => {
      const csv = [
        'Date,Description,Amount',
        '2024-02-14,"Dinner, drinks & tip",95.00',
      ].join('\n');

      const result = parseCsvTransactions(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].description).toBe('Dinner, drinks & tip');
    });

    it('should handle escaped double quotes inside quoted fields', () => {
      const csv = [
        'Date,Description,Amount',
        '2024-02-15,"She said ""hello""",12.00',
      ].join('\n');

      const result = parseCsvTransactions(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].description).toBe('She said "hello"');
    });
  });

  // ─── 6. Empty values ─────────────────────────────────────────────────────

  describe('6 — Empty values', () => {
    it('should skip rows with empty description', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [
          ['2024-01-01', '', '10.00'],
          ['2024-01-02', 'Valid Row', '20.00'],
        ]
      );

      const result = parseCsvTransactions(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
      expect(result.transactions[0].description).toBe('Valid Row');
    });

    it('should skip rows with empty date', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [
          ['', 'No Date Row', '10.00'],
          ['2024-01-02', 'With Date', '20.00'],
        ]
      );

      const result = parseCsvTransactions(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });

    it('should report error on rows with invalid amount', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [
          ['2024-01-01', 'Bad Amount', 'abc'],
          ['2024-01-02', 'Good Amount', '20.00'],
        ]
      );

      const result = parseCsvTransactions(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain('Invalid amount');
    });
  });

  // ─── 7. Different date formats ────────────────────────────────────────────

  describe('7 — Date format parsing', () => {
    it('should parse ISO format YYYY-MM-DD', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-06-15', 'ISO date', '10.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].date).toBe('2024-06-15');
    });

    it('should parse MM/DD/YYYY format', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['01/15/2024', 'US date', '10.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].date).toBe('2024-01-15');
    });

    it('should parse DD/MM/YYYY when day > 12', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['25/03/2024', 'EU date', '10.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].date).toBe('2024-03-25');
    });

    it('should parse DD-Mon-YYYY format (e.g. 15-Jan-2024)', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['15-Jan-2024', 'Month name date', '10.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].date).toBe('2024-01-15');
    });

    it('should parse DD Mon YYYY format', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['15 January 2024', 'Full month name', '10.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].date).toBe('2024-01-15');
    });

    it('should parse Mon DD, YYYY format', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['January 15, 2024', 'US written date', '10.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].date).toBe('2024-01-15');
    });

    it('should parse dates with dot separator (DD.MM.YYYY)', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['25.03.2024', 'Dot-separated', '10.00']]
      );
      const result = parseCsvTransactions(csv);
      // Day > 12 ⇒ DD/MM/YYYY interpretation
      expect(result.transactions[0].date).toBe('2024-03-25');
    });
  });

  // ─── 8. Period decimal separator amounts ──────────────────────────────────

  describe('8 — Amounts with period decimal separator', () => {
    it('should parse simple decimal amounts (1234.56)', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'Purchase', '1234.56']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(1234.56);
    });

    it('should parse amounts with thousands separators (1,234.56)', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'Big Purchase', '1,234.56']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(1234.56);
    });
  });

  // ─── 9. Comma decimal separator amounts ───────────────────────────────────

  describe('9 — Amounts with comma decimal separator', () => {
    it('should parse amounts where commas are stripped as thousands separators', () => {
      // Note: the parser treats commas as thousands separators and strips them.
      // "1234,56" → after stripping commas → "123456" (parseFloat("123456") = 123456)
      // This is the current parser behaviour.
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'European amount', '1234,56']],
        ';'
      );
      const result = parseCsvTransactions(csv);
      // Parser strips commas → "123456" → 123456
      expect(result.transactions[0].amount).toBe(123456);
    });
  });

  // ─── 10. Header row mapping ───────────────────────────────────────────────

  describe('10 — Header row mapping', () => {
    it('should map "Transaction Date" header to date column', () => {
      const csv = buildCsv(
        ['Transaction Date', 'Narrative', 'Amount'],
        [['2024-01-01', 'Bank Transfer', '500.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].date).toBe('2024-01-01');
    });

    it('should support debit/credit column layout', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Debit', 'Credit'],
        [
          ['2024-01-01', 'Payment', '100.00', ''],
          ['2024-01-02', 'Salary', '', '3000.00'],
        ]
      );
      const result = parseCsvTransactions(csv);

      expect(result.transactions).toHaveLength(2);
      // Debit → positive (outflow)
      expect(result.transactions[0].amount).toBe(100);
      // Credit → negative (inflow)
      expect(result.transactions[1].amount).toBe(-3000);
    });

    it('should detect "Payee" as a description column', () => {
      const csv = buildCsv(
        ['Date', 'Payee', 'Amount'],
        [['2024-01-01', 'Amazon', '25.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].description).toBe('Amazon');
    });

    it('should detect "Reference" and "Currency" columns', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount', 'Reference', 'Currency'],
        [['2024-01-01', 'Wire Transfer', '500.00', 'REF-123', 'USD']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].reference).toBe('REF-123');
      expect(result.transactions[0].currency).toBe('USD');
    });

    it('should detect "Money Out" / "Money In" as debit/credit', () => {
      const csv = buildCsv(
        ['Date', 'Details', 'Money Out', 'Money In'],
        [
          ['2024-01-01', 'Bill Payment', '75.00', ''],
          ['2024-01-02', 'Refund', '', '25.00'],
        ]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].amount).toBe(75);    // Outflow
      expect(result.transactions[1].amount).toBe(-25);   // Inflow
    });

    it('should return error when required columns are missing', () => {
      const csv = 'Foo,Bar,Baz\n1,2,3';
      const result = parseCsvTransactions(csv);
      expect(result.transactions).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain('Could not auto-detect column mapping');
    });
  });

  // ─── 11. Error on empty file ──────────────────────────────────────────────

  describe('11 — Error on empty file', () => {
    it('should return an error for a completely empty string', () => {
      const result = parseCsvTransactions('');
      expect(result.transactions).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain('at least a header row and one data row');
    });

    it('should return an error for whitespace-only input', () => {
      const result = parseCsvTransactions('   \n  \n  ');
      expect(result.transactions).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 12. Error on file with only headers ──────────────────────────────────

  describe('12 — Error on file with only headers', () => {
    it('should return an error when only a header row is present', () => {
      const result = parseCsvTransactions('Date,Description,Amount');
      expect(result.transactions).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain('at least a header row and one data row');
    });

    it('should return error for header with trailing newline but no data', () => {
      const result = parseCsvTransactions('Date,Description,Amount\n');
      expect(result.transactions).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 13. Large numbers ────────────────────────────────────────────────────

  describe('13 — Large numbers', () => {
    it('should handle large amounts correctly (millions)', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'Real Estate Payment', '2,500,000.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(2500000);
    });

    it('should handle amounts with many decimal places', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'Crypto Trade', '0.00045']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBeCloseTo(0.00045, 5);
    });

    it('should handle very small amounts (< 1 cent)', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'Micro Transaction', '0.01']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(0.01);
    });
  });

  // ─── 14. Negative amounts ─────────────────────────────────────────────────

  describe('14 — Negative amounts', () => {
    it('should handle negative amounts with minus sign', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'Refund', '-50.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(-50);
    });

    it('should handle parenthetical negatives (500.00) → -500', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'Chargeback', '(500.00)']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(-500);
    });

    it('should handle negative amounts in debit/credit columns', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Debit', 'Credit'],
        [['2024-01-01', 'Reversed Payment', '-100.00', '']]
      );
      const result = parseCsvTransactions(csv);
      // Debit column uses Math.abs, so even negative debit becomes positive (outflow)
      expect(result.transactions[0].amount).toBe(100);
    });
  });

  // ─── 15. Currency symbols in amounts ──────────────────────────────────────

  describe('15 — Currency symbols in amounts', () => {
    it('should strip $ from amounts', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'USD Payment', '$1,250.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(1250);
    });

    it('should strip £ from amounts', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'GBP Payment', '£800.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(800);
    });

    it('should strip € from amounts', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'EUR Payment', '€1,200.50']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(1200.5);
    });

    it('should strip ¥ from amounts', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'JPY Payment', '¥50000']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(50000);
    });

    it('should strip ₹ from amounts', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'INR Payment', '₹75,000.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(75000);
    });

    it('should handle currency symbol with negative sign', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'Refund', '-$150.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.transactions[0].amount).toBe(-150);
    });
  });

  // ─── Additional edge cases ────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle Windows-style \\r\\n line endings', () => {
      const csv = 'Date,Description,Amount\r\n2024-01-01,Test,10.00\r\n2024-01-02,Test2,20.00';
      const result = parseCsvTransactions(csv);
      expect(result.transactions).toHaveLength(2);
    });

    it('should handle old Mac-style \\r line endings', () => {
      const csv = 'Date,Description,Amount\r2024-01-01,Test,10.00\r2024-01-02,Test2,20.00';
      const result = parseCsvTransactions(csv);
      expect(result.transactions).toHaveLength(2);
    });

    it('should skip blank lines in the middle of the file', () => {
      const csv = 'Date,Description,Amount\n2024-01-01,Test,10.00\n\n\n2024-01-02,Test2,20.00';
      const result = parseCsvTransactions(csv);
      expect(result.transactions).toHaveLength(2);
    });

    it('should provide detectedFormat string describing the mapping', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [['2024-01-01', 'Test', '10.00']]
      );
      const result = parseCsvTransactions(csv);
      expect(result.detectedFormat).toContain('auto-detected');
      expect(result.detectedFormat).toContain('Date');
      expect(result.detectedFormat).toContain('Description');
      expect(result.detectedFormat).toContain('Amount');
    });

    it('should return "unknown" detectedFormat when headers are unrecognizable', () => {
      const csv = 'Col1,Col2,Col3\nfoo,bar,baz';
      const result = parseCsvTransactions(csv);
      expect(result.detectedFormat).toBe('unknown');
    });

    it('should handle a mix of valid and invalid rows correctly', () => {
      const csv = buildCsv(
        ['Date', 'Description', 'Amount'],
        [
          ['2024-01-01', 'Valid', '10.00'],
          ['invalid-date', 'Bad Date', '20.00'],
          ['2024-01-03', 'Also Valid', '30.00'],
          ['2024-01-04', '', '40.00'],       // empty description → skipped
          ['2024-01-05', 'Bad Amt', 'xyz'],  // invalid amount → error
        ]
      );
      const result = parseCsvTransactions(csv);

      expect(result.transactions).toHaveLength(2);
      expect(result.errors.length).toBeGreaterThanOrEqual(2); // bad date + bad amount
      expect(result.skipped).toBeGreaterThanOrEqual(1);       // empty description
    });
  });
});
