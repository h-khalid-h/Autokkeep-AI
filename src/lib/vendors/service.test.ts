import { describe, it, expect } from 'vitest';
import {
  normalizeMerchantName,
  IRS_1099_THRESHOLD,
} from './service';

describe('normalizeMerchantName', () => {
  it('lowercases and trims', () => {
    expect(normalizeMerchantName('  STARBUCKS  ')).toBe('starbucks');
  });

  it('strips store numbers', () => {
    expect(normalizeMerchantName('STARBUCKS #12345 SEATTLE')).toBe('starbucks seattle');
  });

  it('strips business suffixes', () => {
    expect(normalizeMerchantName('Amazon.com, Inc.')).toBe('amazon');
  });

  it('strips LLC suffix', () => {
    expect(normalizeMerchantName('Acme Services LLC')).toBe('acme services');
  });

  it('handles punctuation', () => {
    expect(normalizeMerchantName("O'Reilly Auto Parts")).toBe('o reilly auto parts');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeMerchantName('')).toBe('');
  });

  it('handles complex merchant names', () => {
    expect(normalizeMerchantName('UBER *TRIP HELP.UBER.COM')).toBe('uber trip help uber');
  });

  it('strips .com', () => {
    expect(normalizeMerchantName('AMAZON.COM')).toBe('amazon');
  });

  it('handles Unicode characters', () => {
    const result = normalizeMerchantName('Café Müller GmbH');
    // Should lowercase, strip GmbH suffix, keep accented chars
    expect(result).toBe('café müller');
  });

  it('handles very long strings (>1000 chars) with length cap', () => {
    const longName = 'A'.repeat(1200);
    const result = normalizeMerchantName(longName);
    // Should not crash, should be capped at 500 chars
    expect(result).toBe('a'.repeat(500));
    expect(result.length).toBe(500);
  });

  it('returns empty string for only punctuation', () => {
    const result = normalizeMerchantName('!@#$%^&*()');
    expect(result).toBe('');
  });

  it('handles numbers only', () => {
    const result = normalizeMerchantName('1234567890');
    expect(result).toBe('1234567890');
  });

  it('handles mixed Unicode and punctuation', () => {
    const result = normalizeMerchantName('  Ñoño\'s Café & Bar, LLC  ');
    // Should strip LLC, punctuation → spaces, then collapse & trim
    expect(result).toContain('ñoño');
    expect(result).toContain('café');
    expect(result).not.toContain('llc');
  });
});

describe('IRS_1099_THRESHOLD', () => {
  it('is $600', () => {
    expect(IRS_1099_THRESHOLD).toBe(600);
  });
});
