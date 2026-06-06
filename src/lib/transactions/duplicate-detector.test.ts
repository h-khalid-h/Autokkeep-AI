import { describe, it, expect } from 'vitest';
import {
  detectDuplicates,
  normalizeMerchant,
  daysBetween,
  stringSimilarity,
  type TransactionRecord,
} from './duplicate-detector';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TransactionRecord> & { id: string }): TransactionRecord {
  return {
    merchant_name: 'Test Merchant',
    amount: 100,
    date: '2024-06-15',
    bank_account_id: 'bank-1',
    plaid_transaction_id: null,
    ...overrides,
  };
}

// ─── normalizeMerchant ──────────────────────────────────────────────────────────

describe('normalizeMerchant', () => {
  it('lowercases and trims', () => {
    expect(normalizeMerchant('  AMAZON  ')).toBe('amazon');
  });

  it('removes trailing reference numbers with #', () => {
    expect(normalizeMerchant('AMAZON #1234')).toBe('amazon');
  });

  it('removes trailing reference numbers with *', () => {
    expect(normalizeMerchant('UBER *TRIP')).toBe('uber *trip');
    expect(normalizeMerchant('SQ *COFFEE SHOP *1234')).toBe('sq *coffee shop');
  });

  it('removes trailing hex IDs', () => {
    expect(normalizeMerchant('UBER TRIP abc123def')).toBe('uber trip');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeMerchant('THE   COFFEE   SHOP')).toBe('the coffee shop');
  });

  it('handles null', () => {
    expect(normalizeMerchant(null)).toBe('');
  });

  it('handles empty string', () => {
    expect(normalizeMerchant('')).toBe('');
  });
});

// ─── daysBetween ────────────────────────────────────────────────────────────────

describe('daysBetween', () => {
  it('returns 0 for same date', () => {
    expect(daysBetween('2024-06-15', '2024-06-15')).toBe(0);
  });

  it('returns correct days apart', () => {
    expect(daysBetween('2024-06-15', '2024-06-18')).toBe(3);
  });

  it('is symmetric', () => {
    expect(daysBetween('2024-06-15', '2024-06-10')).toBe(5);
    expect(daysBetween('2024-06-10', '2024-06-15')).toBe(5);
  });

  it('handles month boundaries', () => {
    expect(daysBetween('2024-06-30', '2024-07-02')).toBe(2);
  });
});

// ─── stringSimilarity ───────────────────────────────────────────────────────────

describe('stringSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(stringSimilarity('amazon', 'amazon')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(stringSimilarity('ab', 'yz')).toBe(0);
  });

  it('returns high similarity for similar strings', () => {
    expect(stringSimilarity('amazon', 'amazone')).toBeGreaterThan(0.7);
  });

  it('returns low similarity for different strings', () => {
    expect(stringSimilarity('amazon', 'starbucks')).toBeLessThan(0.3);
  });

  it('handles single-char strings', () => {
    expect(stringSimilarity('a', 'b')).toBe(0);
  });

  it('handles empty strings', () => {
    expect(stringSimilarity('', '')).toBe(1);
  });
});

// ─── detectDuplicates ───────────────────────────────────────────────────────────

describe('detectDuplicates', () => {
  it('detects exact duplicates (same merchant, amount, date)', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-15' }),
      makeTx({ id: 'tx-2', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-15' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups).toHaveLength(1);
    expect(groups[0].transactionIds).toContain('tx-1');
    expect(groups[0].transactionIds).toContain('tx-2');
    expect(groups[0].confidence).toBeGreaterThanOrEqual(80);
    expect(groups[0].amount).toBe(49.99);
  });

  it('detects near-duplicates (same merchant, same amount, 1 day apart)', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: 'Starbucks', amount: 5.50, date: '2024-06-15' }),
      makeTx({ id: 'tx-2', merchant_name: 'Starbucks', amount: 5.50, date: '2024-06-16' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBeGreaterThanOrEqual(60);
  });

  it('detects cross-bank duplicates', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: 'Amazon', amount: 99.00, date: '2024-06-15', bank_account_id: 'bank-1' }),
      makeTx({ id: 'tx-2', merchant_name: 'Amazon', amount: 99.00, date: '2024-06-15', bank_account_id: 'bank-2' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBeGreaterThanOrEqual(90);
    expect(groups[0].reason).toContain('different bank accounts');
  });

  it('does NOT flag different amounts as duplicates', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-15' }),
      makeTx({ id: 'tx-2', merchant_name: 'Amazon', amount: 79.99, date: '2024-06-15' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups).toHaveLength(0);
  });

  it('does NOT flag transactions more than 3 days apart', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-10' }),
      makeTx({ id: 'tx-2', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-20' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups).toHaveLength(0);
  });

  it('does NOT flag different merchants as duplicates', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-15' }),
      makeTx({ id: 'tx-2', merchant_name: 'Starbucks', amount: 49.99, date: '2024-06-15' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups).toHaveLength(0);
  });

  it('handles similar but not identical merchant names', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: 'AMAZON.COM', amount: 49.99, date: '2024-06-15' }),
      makeTx({ id: 'tx-2', merchant_name: 'AMAZON.CO', amount: 49.99, date: '2024-06-15' }),
    ];

    const groups = detectDuplicates(txns);

    // These are similar enough to flag
    expect(groups).toHaveLength(1);
  });

  it('skips transactions with same plaid_transaction_id', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-15', plaid_transaction_id: 'plaid-123' }),
      makeTx({ id: 'tx-2', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-15', plaid_transaction_id: 'plaid-123' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups).toHaveLength(0);
  });

  it('handles 3+ duplicates in a single group', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: 'Netflix', amount: 15.99, date: '2024-06-15' }),
      makeTx({ id: 'tx-2', merchant_name: 'Netflix', amount: 15.99, date: '2024-06-15' }),
      makeTx({ id: 'tx-3', merchant_name: 'Netflix', amount: 15.99, date: '2024-06-16' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups).toHaveLength(1);
    expect(groups[0].transactionIds).toHaveLength(3);
  });

  it('handles empty array', () => {
    expect(detectDuplicates([])).toEqual([]);
  });

  it('handles single transaction', () => {
    expect(detectDuplicates([makeTx({ id: 'tx-1' })])).toEqual([]);
  });

  it('detects multiple independent duplicate groups', () => {
    const txns: TransactionRecord[] = [
      // Group 1: Amazon duplicates
      makeTx({ id: 'tx-1', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-15' }),
      makeTx({ id: 'tx-2', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-15' }),
      // Group 2: Netflix duplicates
      makeTx({ id: 'tx-3', merchant_name: 'Netflix', amount: 15.99, date: '2024-06-20' }),
      makeTx({ id: 'tx-4', merchant_name: 'Netflix', amount: 15.99, date: '2024-06-21' }),
      // Non-duplicate
      makeTx({ id: 'tx-5', merchant_name: 'Starbucks', amount: 5.50, date: '2024-06-25' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups).toHaveLength(2);
  });

  it('returns dateRange with earliest and latest dates', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-15' }),
      makeTx({ id: 'tx-2', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-17' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups[0].dateRange.earliest).toBe('2024-06-15');
    expect(groups[0].dateRange.latest).toBe('2024-06-17');
  });

  it('sorts groups by confidence descending', () => {
    const txns: TransactionRecord[] = [
      // Lower confidence: different banks, not same day
      makeTx({ id: 'tx-1', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-15', bank_account_id: 'bank-1' }),
      makeTx({ id: 'tx-2', merchant_name: 'Amazon', amount: 49.99, date: '2024-06-17', bank_account_id: 'bank-1' }),
      // Higher confidence: same day, different banks
      makeTx({ id: 'tx-3', merchant_name: 'Netflix', amount: 15.99, date: '2024-06-20', bank_account_id: 'bank-1' }),
      makeTx({ id: 'tx-4', merchant_name: 'Netflix', amount: 15.99, date: '2024-06-20', bank_account_id: 'bank-2' }),
    ];

    const groups = detectDuplicates(txns);

    expect(groups).toHaveLength(2);
    expect(groups[0].confidence).toBeGreaterThanOrEqual(groups[1].confidence);
  });

  it('handles merchant names with null values', () => {
    const txns: TransactionRecord[] = [
      makeTx({ id: 'tx-1', merchant_name: null, amount: 49.99, date: '2024-06-15' }),
      makeTx({ id: 'tx-2', merchant_name: null, amount: 49.99, date: '2024-06-15' }),
    ];

    // Both merchants normalize to '' — similarity of '' to '' is 1 but
    // the function returns 0 for empty strings in stringSimilarity
    const groups = detectDuplicates(txns);
    // This should NOT flag as duplicate since we can't compare null merchants meaningfully
    expect(groups).toHaveLength(0);
  });
});
