import { describe, it, expect } from 'vitest';
import {
  stripPII,
  hashSourceData,
  generateCitationToken,
  tokenizeTransaction,
} from './privacy-parser';
import type { RawTransactionData } from './privacy-parser';

// ============================================
// stripPII
// ============================================
describe('stripPII', () => {
  it('strips credit card numbers', () => {
    expect(stripPII('card 4111 1111 1111 1111 charged')).not.toContain('4111');
    expect(stripPII('card 4111-1111-1111-1111 charged')).not.toContain('4111');
    expect(stripPII('card 4111111111111111 charged')).not.toContain('4111');
  });

  it('strips SSNs', () => {
    expect(stripPII('SSN: 123-45-6789')).not.toContain('123-45-6789');
    expect(stripPII('SSN: 123 45 6789')).not.toContain('123 45 6789');
    // Bare 9-digit sequences intentionally NOT stripped to avoid false positives
    // on transaction reference numbers, ZIP+4, etc.
    expect(stripPII('ref 123456789')).toContain('123456789');
  });

  it('strips phone numbers', () => {
    const result = stripPII('Call 555-123-4567');
    expect(result).not.toContain('555-123-4567');
  });

  it('strips email addresses', () => {
    const result = stripPII('Email john@example.com for receipt');
    expect(result).not.toContain('john@example.com');
    expect(result).toContain('[REDACTED]');
  });

  it('strips ZIP codes', () => {
    const result = stripPII('Address in 90210');
    expect(result).not.toContain('90210');
  });

  it('collapses multiple [REDACTED] tokens', () => {
    const input = 'John Smith Jr. 123-45-6789 john@example.com 555-123-4567';
    const result = stripPII(input);
    // Should not have consecutive [REDACTED] [REDACTED]
    expect(result).not.toMatch(/\[REDACTED\]\s+\[REDACTED\]/);
  });

  it('returns clean text unchanged', () => {
    expect(stripPII('STARBUCKS COFFEE SEATTLE WA')).toBe('STARBUCKS COFFEE SEATTLE WA');
  });

  it('handles empty string', () => {
    expect(stripPII('')).toBe('');
  });
});

// ============================================
// hashSourceData
// ============================================
describe('hashSourceData', () => {
  const baseTransaction: RawTransactionData = {
    merchant: 'Starbucks',
    amount: 5.50,
    date: '2026-01-15',
  };

  it('produces a hex string', () => {
    const hash = hashSourceData(baseTransaction);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic (same input → same output)', () => {
    const hash1 = hashSourceData(baseTransaction);
    const hash2 = hashSourceData(baseTransaction);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = hashSourceData(baseTransaction);
    const hash2 = hashSourceData({ ...baseTransaction, amount: 6.00 });
    expect(hash1).not.toBe(hash2);
  });

  it('handles optional cardHolder field', () => {
    const hash1 = hashSourceData(baseTransaction);
    const hash2 = hashSourceData({ ...baseTransaction, cardHolder: 'John Doe' });
    expect(hash1).not.toBe(hash2);
  });
});

// ============================================
// generateCitationToken
// ============================================
describe('generateCitationToken', () => {
  it('produces UUID-like format (8-4-4-4-12)', () => {
    const token = generateCitationToken('abc123', '2026-01-15T00:00:00Z');
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('is deterministic', () => {
    const t1 = generateCitationToken('hash1', '2026-01-15T00:00:00Z');
    const t2 = generateCitationToken('hash1', '2026-01-15T00:00:00Z');
    expect(t1).toBe(t2);
  });

  it('changes with different timestamps', () => {
    const t1 = generateCitationToken('hash1', '2026-01-15T00:00:00Z');
    const t2 = generateCitationToken('hash1', '2026-01-16T00:00:00Z');
    expect(t1).not.toBe(t2);
  });
});

// ============================================
// tokenizeTransaction
// ============================================
describe('tokenizeTransaction', () => {
  it('produces a valid tokenized result', () => {
    const raw: RawTransactionData = {
      merchant: 'STARBUCKS #12345 SEATTLE',
      amount: 5.50,
      date: '2026-01-15',
    };
    const result = tokenizeTransaction(raw);
    expect(result.vendorToken).toBeTruthy();
    expect(result.amount).toBe(5.50);
    expect(result.dateMarker).toBe('2026-01-15');
    expect(result.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.tokenizedAt).toBeTruthy();
  });

  it('strips PII from vendor token', () => {
    const raw: RawTransactionData = {
      merchant: 'STORE john@example.com 4111-1111-1111-1111',
      amount: 10,
      date: '2026-01-15',
    };
    const result = tokenizeTransaction(raw);
    expect(result.vendorToken).not.toContain('john@example.com');
    expect(result.vendorToken).not.toContain('4111');
  });

  it('defaults currency to USD', () => {
    const raw: RawTransactionData = {
      merchant: 'Test',
      amount: 1,
      date: '2026-01-15',
    };
    const result = tokenizeTransaction(raw);
    expect(result.currency).toBe('USD');
  });

  it('uses provided currency', () => {
    const raw: RawTransactionData = {
      merchant: 'Test',
      amount: 1,
      date: '2026-01-15',
      rawData: { currency: 'EUR' },
    };
    const result = tokenizeTransaction(raw);
    expect(result.currency).toBe('EUR');
  });

  it('sets mccCode from rawData', () => {
    const raw: RawTransactionData = {
      merchant: 'Test',
      amount: 1,
      date: '2026-01-15',
      rawData: { mcc: '5411' },
    };
    const result = tokenizeTransaction(raw);
    expect(result.mccCode).toBe('5411');
  });

  it('sets mccCode to null when not provided', () => {
    const raw: RawTransactionData = {
      merchant: 'Test',
      amount: 1,
      date: '2026-01-15',
    };
    const result = tokenizeTransaction(raw);
    expect(result.mccCode).toBeNull();
  });
});
