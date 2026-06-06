import { describe, it, expect } from 'vitest';
import { detectRecurringPatterns, normalizeMerchantName } from './detector';
import type { RecurringPattern } from './detector';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Creates a transaction with a date offset by `dayOffset` from a base date. */
function makeTxn(
  id: string,
  merchant: string,
  amount: number,
  baseDate: string,
  dayOffset: number
) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + dayOffset);
  return {
    id,
    merchant_name: merchant,
    amount,
    date: date.toISOString().split('T')[0],
  };
}

/** Helper to find a pattern by merchant name from results. */
function findPattern(patterns: RecurringPattern[], merchant: string): RecurringPattern | undefined {
  return patterns.find((p) => p.merchantName === normalizeMerchantName(merchant));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('normalizeMerchantName', () => {
  it('lowercases and trims', () => {
    expect(normalizeMerchantName('  Netflix  ')).toBe('netflix');
  });

  it('strips trailing numeric IDs', () => {
    expect(normalizeMerchantName('Spotify 12345')).toBe('spotify');
  });

  it('strips trailing hash IDs', () => {
    expect(normalizeMerchantName('Netflix #99887')).toBe('netflix');
  });

  it('is case-insensitive', () => {
    expect(normalizeMerchantName('ADOBE SYSTEMS')).toBe('adobe systems');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeMerchantName('Adobe   Creative   Cloud')).toBe('adobe creative cloud');
  });

  it('preserves names without trailing IDs', () => {
    expect(normalizeMerchantName('Amazon Prime')).toBe('amazon prime');
  });

  it('handles single character name', () => {
    expect(normalizeMerchantName('A')).toBe('a');
  });

  it('handles empty string', () => {
    expect(normalizeMerchantName('')).toBe('');
  });
});

describe('detectRecurringPatterns', () => {
  // ── Monthly Subscription ────────────────────────────────────────────────

  describe('monthly subscription detection', () => {
    it('detects monthly subscription with consistent ~30 day intervals', () => {
      const transactions = [
        makeTxn('m1', 'Netflix', -15.99, '2025-01-15', 0),
        makeTxn('m2', 'Netflix', -15.99, '2025-01-15', 30),
        makeTxn('m3', 'Netflix', -15.99, '2025-01-15', 60),
        makeTxn('m4', 'Netflix', -15.99, '2025-01-15', 90),
        makeTxn('m5', 'Netflix', -15.99, '2025-01-15', 120),
      ];

      const patterns = detectRecurringPatterns(transactions);
      const netflix = findPattern(patterns, 'Netflix');

      expect(netflix).toBeDefined();
      expect(netflix!.frequency).toBe('monthly');
      expect(netflix!.averageAmount).toBe(15.99);
      expect(netflix!.occurrenceCount).toBe(5);
      expect(netflix!.confidence).toBeGreaterThanOrEqual(60);
      expect(netflix!.transactionIds).toHaveLength(5);
    });

    it('detects monthly pattern with slight interval variation', () => {
      const transactions = [
        makeTxn('m1', 'Spotify', -9.99, '2025-01-01', 0),
        makeTxn('m2', 'Spotify', -9.99, '2025-01-01', 28),
        makeTxn('m3', 'Spotify', -9.99, '2025-01-01', 59),
        makeTxn('m4', 'Spotify', -9.99, '2025-01-01', 89),
      ];

      const patterns = detectRecurringPatterns(transactions);
      const spotify = findPattern(patterns, 'Spotify');

      expect(spotify).toBeDefined();
      expect(spotify!.frequency).toBe('monthly');
      expect(spotify!.confidence).toBeGreaterThanOrEqual(60);
    });

    it('groups merchant names with different trailing IDs', () => {
      const transactions = [
        makeTxn('m1', 'Netflix #12345', -15.99, '2025-01-15', 0),
        makeTxn('m2', 'Netflix #67890', -15.99, '2025-01-15', 30),
        makeTxn('m3', 'Netflix #11111', -15.99, '2025-01-15', 60),
      ];

      const patterns = detectRecurringPatterns(transactions);
      const netflix = findPattern(patterns, 'Netflix');

      expect(netflix).toBeDefined();
      expect(netflix!.occurrenceCount).toBe(3);
    });
  });

  // ── Weekly Payments ─────────────────────────────────────────────────────

  describe('weekly payment detection', () => {
    it('detects weekly payment with 7-day intervals', () => {
      const transactions = [
        makeTxn('w1', 'Cleaning Service', -50.0, '2025-03-01', 0),
        makeTxn('w2', 'Cleaning Service', -50.0, '2025-03-01', 7),
        makeTxn('w3', 'Cleaning Service', -50.0, '2025-03-01', 14),
        makeTxn('w4', 'Cleaning Service', -50.0, '2025-03-01', 21),
        makeTxn('w5', 'Cleaning Service', -50.0, '2025-03-01', 28),
      ];

      const patterns = detectRecurringPatterns(transactions);
      const cleaning = findPattern(patterns, 'Cleaning Service');

      expect(cleaning).toBeDefined();
      expect(cleaning!.frequency).toBe('weekly');
      expect(cleaning!.averageAmount).toBe(50.0);
      expect(cleaning!.confidence).toBeGreaterThanOrEqual(80);
    });

    it('detects weekly with minor jitter (6-8 day intervals)', () => {
      const transactions = [
        makeTxn('w1', 'Payroll', -2000, '2025-01-06', 0),
        makeTxn('w2', 'Payroll', -2000, '2025-01-06', 7),
        makeTxn('w3', 'Payroll', -2000, '2025-01-06', 13),
        makeTxn('w4', 'Payroll', -2000, '2025-01-06', 21),
      ];

      const patterns = detectRecurringPatterns(transactions);
      const payroll = findPattern(patterns, 'Payroll');

      expect(payroll).toBeDefined();
      expect(payroll!.frequency).toBe('weekly');
    });
  });

  // ── Quarterly Pattern ───────────────────────────────────────────────────

  describe('quarterly pattern detection', () => {
    it('detects quarterly pattern with ~90 day intervals', () => {
      const transactions = [
        makeTxn('q1', 'Insurance Corp', -500, '2024-01-15', 0),
        makeTxn('q2', 'Insurance Corp', -500, '2024-01-15', 90),
        makeTxn('q3', 'Insurance Corp', -500, '2024-01-15', 180),
        makeTxn('q4', 'Insurance Corp', -500, '2024-01-15', 270),
      ];

      const patterns = detectRecurringPatterns(transactions);
      const insurance = findPattern(patterns, 'Insurance Corp');

      expect(insurance).toBeDefined();
      expect(insurance!.frequency).toBe('quarterly');
      expect(insurance!.averageAmount).toBe(500);
      expect(insurance!.confidence).toBeGreaterThanOrEqual(60);
    });
  });

  // ── Annual Pattern ──────────────────────────────────────────────────────

  describe('annual pattern detection', () => {
    it('detects annual pattern with ~365 day intervals', () => {
      const transactions = [
        makeTxn('a1', 'Domain Registrar', -12, '2022-06-01', 0),
        makeTxn('a2', 'Domain Registrar', -12, '2022-06-01', 365),
        makeTxn('a3', 'Domain Registrar', -12, '2022-06-01', 730),
      ];

      const patterns = detectRecurringPatterns(transactions);
      const domain = findPattern(patterns, 'Domain Registrar');

      expect(domain).toBeDefined();
      expect(domain!.frequency).toBe('annual');
      expect(domain!.confidence).toBeGreaterThanOrEqual(60);
    });
  });

  // ── Non-Recurring Merchants ─────────────────────────────────────────────

  describe('non-recurring merchants', () => {
    it('does not detect random amounts and random intervals', () => {
      const transactions = [
        makeTxn('r1', 'Random Store', -42.5, '2025-01-05', 0),
        makeTxn('r2', 'Random Store', -87.3, '2025-01-05', 3),
        makeTxn('r3', 'Random Store', -15.0, '2025-01-05', 47),
        makeTxn('r4', 'Random Store', -120.0, '2025-01-05', 52),
        makeTxn('r5', 'Random Store', -33.0, '2025-01-05', 110),
      ];

      const patterns = detectRecurringPatterns(transactions);
      const random = findPattern(patterns, 'Random Store');

      // Should either not be detected or have low confidence (filtered out)
      expect(random).toBeUndefined();
    });

    it('does not detect when interval average falls outside all ranges', () => {
      // Average interval ~45 days — between monthly (25-35) and quarterly (80-100)
      const transactions = [
        makeTxn('g1', 'Gap Purchase', -30, '2025-01-01', 0),
        makeTxn('g2', 'Gap Purchase', -30, '2025-01-01', 45),
        makeTxn('g3', 'Gap Purchase', -30, '2025-01-01', 90),
      ];

      const patterns = detectRecurringPatterns(transactions);
      const gap = findPattern(patterns, 'Gap Purchase');

      expect(gap).toBeUndefined();
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      expect(detectRecurringPatterns([])).toEqual([]);
    });

    it('does not detect patterns with fewer than 3 transactions', () => {
      const transactions = [
        makeTxn('e1', 'Rare Vendor', -100, '2025-01-01', 0),
        makeTxn('e2', 'Rare Vendor', -100, '2025-01-01', 30),
      ];

      const patterns = detectRecurringPatterns(transactions);
      expect(patterns).toHaveLength(0);
    });

    it('does not detect patterns when all transactions are on the same date', () => {
      const transactions = [
        makeTxn('s1', 'Same Day', -25, '2025-01-01', 0),
        makeTxn('s2', 'Same Day', -25, '2025-01-01', 0),
        makeTxn('s3', 'Same Day', -25, '2025-01-01', 0),
      ];

      const patterns = detectRecurringPatterns(transactions);
      expect(findPattern(patterns, 'Same Day')).toBeUndefined();
    });

    it('handles transactions with null/empty merchant names gracefully', () => {
      const transactions = [
        { id: 'n1', merchant_name: '', amount: -10, date: '2025-01-01' },
        { id: 'n2', merchant_name: '', amount: -10, date: '2025-02-01' },
        { id: 'n3', merchant_name: '', amount: -10, date: '2025-03-01' },
      ];

      const patterns = detectRecurringPatterns(transactions);
      expect(patterns).toHaveLength(0);
    });

    it('predicts next expected date correctly', () => {
      const transactions = [
        makeTxn('p1', 'Gym Membership', -40, '2025-06-01', 0),
        makeTxn('p2', 'Gym Membership', -40, '2025-06-01', 30),
        makeTxn('p3', 'Gym Membership', -40, '2025-06-01', 60),
        makeTxn('p4', 'Gym Membership', -40, '2025-06-01', 90),
      ];

      const patterns = detectRecurringPatterns(transactions);
      const gym = findPattern(patterns, 'Gym Membership');

      expect(gym).toBeDefined();
      // Last occurrence is 90 days from Jun 1 = Aug 30.
      // Next expected = lastOccurrence + 30 days (monthly expected)
      const lastDate = new Date(gym!.lastOccurrence);
      const nextDate = new Date(gym!.nextExpected);
      const daysDiff = (nextDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBe(30);
    });
  });

  // ── Confidence Scoring ──────────────────────────────────────────────────

  describe('confidence calculation', () => {
    it('assigns higher confidence to perfectly consistent intervals', () => {
      const perfectMonthly = [
        makeTxn('c1', 'Perfect Sub', -10, '2025-01-01', 0),
        makeTxn('c2', 'Perfect Sub', -10, '2025-01-01', 30),
        makeTxn('c3', 'Perfect Sub', -10, '2025-01-01', 60),
        makeTxn('c4', 'Perfect Sub', -10, '2025-01-01', 90),
        makeTxn('c5', 'Perfect Sub', -10, '2025-01-01', 120),
      ];

      const noisyMonthly = [
        makeTxn('n1', 'Noisy Sub', -10, '2025-01-01', 0),
        makeTxn('n2', 'Noisy Sub', -10, '2025-01-01', 26),
        makeTxn('n3', 'Noisy Sub', -10, '2025-01-01', 58),
        makeTxn('n4', 'Noisy Sub', -10, '2025-01-01', 85),
        makeTxn('n5', 'Noisy Sub', -10, '2025-01-01', 118),
      ];

      const patterns = detectRecurringPatterns([...perfectMonthly, ...noisyMonthly]);
      const perfect = findPattern(patterns, 'Perfect Sub');
      const noisy = findPattern(patterns, 'Noisy Sub');

      expect(perfect).toBeDefined();
      // Noisy may or may not pass threshold depending on jitter
      if (noisy) {
        expect(perfect!.confidence).toBeGreaterThan(noisy.confidence);
      } else {
        // Noisy was too erratic and was filtered out — still valid
        expect(perfect!.confidence).toBeGreaterThanOrEqual(60);
      }
    });

    it('filters out low-confidence patterns (below 60)', () => {
      // Highly erratic intervals — should produce confidence < 60
      const transactions = [
        makeTxn('e1', 'Erratic Vendor', -20, '2025-01-01', 0),
        makeTxn('e2', 'Erratic Vendor', -20, '2025-01-01', 25),
        makeTxn('e3', 'Erratic Vendor', -20, '2025-01-01', 60),
        makeTxn('e4', 'Erratic Vendor', -20, '2025-01-01', 70),
      ];

      const patterns = detectRecurringPatterns(transactions);
      // All returned patterns must have confidence >= 60
      for (const p of patterns) {
        expect(p.confidence).toBeGreaterThanOrEqual(60);
      }
    });
  });

  // ── Sorting ─────────────────────────────────────────────────────────────

  describe('result sorting', () => {
    it('sorts patterns by confidence descending', () => {
      const transactions = [
        // Perfect weekly
        makeTxn('w1', 'Weekly Vendor', -20, '2025-01-01', 0),
        makeTxn('w2', 'Weekly Vendor', -20, '2025-01-01', 7),
        makeTxn('w3', 'Weekly Vendor', -20, '2025-01-01', 14),
        makeTxn('w4', 'Weekly Vendor', -20, '2025-01-01', 21),
        makeTxn('w5', 'Weekly Vendor', -20, '2025-01-01', 28),
        // Perfect monthly
        makeTxn('m1', 'Monthly Vendor', -50, '2025-01-01', 0),
        makeTxn('m2', 'Monthly Vendor', -50, '2025-01-01', 30),
        makeTxn('m3', 'Monthly Vendor', -50, '2025-01-01', 60),
        makeTxn('m4', 'Monthly Vendor', -50, '2025-01-01', 90),
      ];

      const patterns = detectRecurringPatterns(transactions);
      expect(patterns.length).toBeGreaterThanOrEqual(2);

      for (let i = 1; i < patterns.length; i++) {
        expect(patterns[i - 1].confidence).toBeGreaterThanOrEqual(patterns[i].confidence);
      }
    });
  });

  // ── Mixed Merchants ─────────────────────────────────────────────────────

  describe('multiple merchants', () => {
    it('detects multiple distinct recurring patterns simultaneously', () => {
      const transactions = [
        // Netflix monthly
        makeTxn('n1', 'Netflix', -15.99, '2025-01-01', 0),
        makeTxn('n2', 'Netflix', -15.99, '2025-01-01', 30),
        makeTxn('n3', 'Netflix', -15.99, '2025-01-01', 60),
        // Gym weekly
        makeTxn('g1', 'Local Gym', -10, '2025-01-01', 0),
        makeTxn('g2', 'Local Gym', -10, '2025-01-01', 7),
        makeTxn('g3', 'Local Gym', -10, '2025-01-01', 14),
        makeTxn('g4', 'Local Gym', -10, '2025-01-01', 21),
        // One-off purchases (should not appear)
        makeTxn('o1', 'Amazon', -99, '2025-03-10', 0),
        makeTxn('o2', 'Amazon', -45, '2025-05-22', 0),
      ];

      const patterns = detectRecurringPatterns(transactions);

      expect(findPattern(patterns, 'Netflix')).toBeDefined();
      expect(findPattern(patterns, 'Local Gym')).toBeDefined();
      // Amazon has only 2 transactions — should not be detected
      expect(findPattern(patterns, 'Amazon')).toBeUndefined();
    });
  });
});
