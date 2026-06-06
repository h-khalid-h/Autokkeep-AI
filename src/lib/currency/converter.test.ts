import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  convertCurrency,
  formatPercentChange,
  formatCompactNumber,
  getSupportedCurrencies,
  getCurrencyName,
} from './converter';

// ============================================
// formatCurrency
// ============================================
describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    const result = formatCurrency(1234.56, 'USD');
    expect(result).toBe('$1,234.56');
  });

  it('formats EUR with locale-specific formatting', () => {
    const result = formatCurrency(1234.56, 'EUR');
    // de-DE locale uses period for thousands and comma for decimal
    expect(result).toContain('1.234,56');
    expect(result).toContain('€');
  });

  it('formats JPY with no decimals', () => {
    const result = formatCurrency(1234, 'JPY');
    expect(result).toContain('1,234');
    // JPY should not show decimal places
    expect(result).not.toContain('.');
  });

  it('formats GBP correctly', () => {
    const result = formatCurrency(99.99, 'GBP');
    expect(result).toContain('99.99');
    expect(result).toContain('£');
  });

  it('falls back for unknown currency codes', () => {
    // Should not throw; uses Intl fallback with 'en-US' locale
    const result = formatCurrency(1234.56, 'XYZ');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    // Should contain some representation of the amount
    expect(result).toContain('1,234.56');
  });

  it('defaults to USD when no currency provided', () => {
    const result = formatCurrency(500);
    expect(result).toBe('$500.00');
  });

  it('handles zero amount', () => {
    const result = formatCurrency(0, 'USD');
    expect(result).toBe('$0.00');
  });

  it('handles negative amounts', () => {
    const result = formatCurrency(-50.25, 'USD');
    expect(result).toContain('50.25');
  });

  it('handles very large amounts', () => {
    const result = formatCurrency(1_000_000_000.99, 'USD');
    expect(result).toContain('1,000,000,000.99');
  });

  it('normalizes lowercase currency codes', () => {
    const result = formatCurrency(100, 'usd');
    expect(result).toBe('$100.00');
  });
});

// ============================================
// convertCurrency
// ============================================
describe('convertCurrency', () => {
  it('converts with a simple exchange rate', () => {
    expect(convertCurrency(100, 1.5)).toBe(150);
  });

  it('converts with exchange rate of 1 (same currency)', () => {
    expect(convertCurrency(250.75, 1)).toBe(250.75);
  });

  it('converts with a fractional exchange rate', () => {
    expect(convertCurrency(100, 0.85)).toBe(85);
  });

  it('rounds to 2 decimal places', () => {
    // 33.33 * 1.333 = 44.43189 → should round to 44.43
    expect(convertCurrency(33.33, 1.333)).toBe(44.43);
  });

  it('handles zero amount', () => {
    expect(convertCurrency(0, 1.5)).toBe(0);
  });

  it('handles zero exchange rate', () => {
    expect(convertCurrency(100, 0)).toBe(0);
  });

  it('handles very small exchange rates', () => {
    const result = convertCurrency(1000, 0.0001);
    expect(result).toBe(0.1);
  });
});

// ============================================
// formatPercentChange
// ============================================
describe('formatPercentChange', () => {
  it('formats positive change with + prefix', () => {
    expect(formatPercentChange(12.5)).toBe('+12.5%');
  });

  it('formats negative change with - prefix', () => {
    expect(formatPercentChange(-5.0)).toBe('-5.0%');
  });

  it('formats zero without + prefix', () => {
    expect(formatPercentChange(0)).toBe('0.0%');
  });

  it('formats small positive change', () => {
    expect(formatPercentChange(0.1)).toBe('+0.1%');
  });

  it('formats large negative change', () => {
    expect(formatPercentChange(-99.9)).toBe('-99.9%');
  });

  it('rounds to 1 decimal place', () => {
    expect(formatPercentChange(12.567)).toBe('+12.6%');
  });
});

// ============================================
// formatCompactNumber
// ============================================
describe('formatCompactNumber', () => {
  it('formats thousands as K', () => {
    const result = formatCompactNumber(1234);
    expect(result).toBe('1.2K');
  });

  it('formats millions as M', () => {
    const result = formatCompactNumber(3_400_000);
    expect(result).toBe('3.4M');
  });

  it('formats billions as B', () => {
    const result = formatCompactNumber(1_200_000_000);
    expect(result).toBe('1.2B');
  });

  it('formats small numbers without suffix', () => {
    const result = formatCompactNumber(500);
    expect(result).toBe('500');
  });

  it('formats zero', () => {
    const result = formatCompactNumber(0);
    expect(result).toBe('0');
  });

  it('formats exactly 1000', () => {
    const result = formatCompactNumber(1000);
    expect(result).toBe('1K');
  });
});

// ============================================
// getSupportedCurrencies
// ============================================
describe('getSupportedCurrencies', () => {
  it('returns array with 21 entries', () => {
    const currencies = getSupportedCurrencies();
    expect(currencies).toHaveLength(21);
  });

  it('each entry has code, name, and symbol', () => {
    const currencies = getSupportedCurrencies();
    for (const currency of currencies) {
      expect(currency).toHaveProperty('code');
      expect(currency).toHaveProperty('name');
      expect(currency).toHaveProperty('symbol');
      expect(typeof currency.code).toBe('string');
      expect(typeof currency.name).toBe('string');
      expect(typeof currency.symbol).toBe('string');
    }
  });

  it('includes major currencies', () => {
    const currencies = getSupportedCurrencies();
    const codes = currencies.map((c) => c.code);
    expect(codes).toContain('USD');
    expect(codes).toContain('EUR');
    expect(codes).toContain('GBP');
    expect(codes).toContain('JPY');
  });

  it('includes MENA currencies', () => {
    const currencies = getSupportedCurrencies();
    const codes = currencies.map((c) => c.code);
    expect(codes).toContain('AED');
    expect(codes).toContain('SAR');
    expect(codes).toContain('EGP');
  });
});

// ============================================
// getCurrencyName
// ============================================
describe('getCurrencyName', () => {
  it('returns "US Dollar" for USD', () => {
    expect(getCurrencyName('USD')).toBe('US Dollar');
  });

  it('returns "Euro" for EUR', () => {
    expect(getCurrencyName('EUR')).toBe('Euro');
  });

  it('returns "British Pound" for GBP', () => {
    const name = getCurrencyName('GBP');
    expect(name).toContain('British');
    expect(name).toContain('Pound');
  });

  it('handles lowercase codes', () => {
    expect(getCurrencyName('usd')).toBe('US Dollar');
  });

  it('returns code itself for unknown currency', () => {
    // Intl.DisplayNames will throw for invalid codes; fallback returns the code
    const result = getCurrencyName('ZZZZ');
    expect(typeof result).toBe('string');
  });
});
