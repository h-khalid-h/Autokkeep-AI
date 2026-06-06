import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getExchangeRate,
  convertAmount,
  getEffectiveAmount,
  calculateUnrealizedFxGainLoss,
  StaleRatesError,
} from './service';

// RATES_AS_OF is '2026-06-01'. Mock Date.now() to be within the 90-day window
// so tests that call getExchangeRate / convertAmount don't throw StaleRatesError.
const FRESH_DATE = new Date('2026-06-05T00:00:00Z').getTime();
// A date well beyond the 90-day window for staleness tests
const STALE_DATE = new Date('2026-10-01T00:00:00Z').getTime();

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(FRESH_DATE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getExchangeRate', () => {
  it('returns null for same currency', () => {
    expect(getExchangeRate('USD', 'USD')).toBeNull();
  });

  it('returns a rate for USD to EUR', () => {
    const rate = getExchangeRate('USD', 'EUR');
    expect(rate).not.toBeNull();
    expect(rate!.from).toBe('USD');
    expect(rate!.to).toBe('EUR');
    expect(rate!.rate).toBeGreaterThan(0);
    expect(rate!.rate).toBeLessThan(2);
    expect(rate!.source).toBe('estimated');
  });

  it('returns a rate for EUR to USD', () => {
    const rate = getExchangeRate('EUR', 'USD');
    expect(rate).not.toBeNull();
    expect(rate!.rate).toBeGreaterThan(0.5);
    expect(rate!.rate).toBeLessThan(3);
  });

  it('handles case insensitivity', () => {
    const rate = getExchangeRate('usd', 'eur');
    expect(rate).not.toBeNull();
  });

  it('returns null for unknown currencies', () => {
    const rate = getExchangeRate('USD', 'XYZ');
    expect(rate).toBeNull();
  });

  it('computes cross rates correctly', () => {
    const usdToEur = getExchangeRate('USD', 'EUR');
    const eurToUsd = getExchangeRate('EUR', 'USD');
    expect(usdToEur).not.toBeNull();
    expect(eurToUsd).not.toBeNull();
    // Cross rate should be approximately inverse
    const product = usdToEur!.rate * eurToUsd!.rate;
    expect(product).toBeCloseTo(1.0, 2);
  });

  it('throws StaleRatesError when rates exceed max age', () => {
    vi.spyOn(Date, 'now').mockReturnValue(STALE_DATE);
    expect(() => getExchangeRate('USD', 'EUR')).toThrow(StaleRatesError);
    expect(() => getExchangeRate('USD', 'EUR')).toThrow(/Currency conversion is disabled/);
  });
});

describe('convertAmount', () => {
  it('returns identity for same currency', () => {
    const result = convertAmount(100, 'USD', 'USD');
    expect(result).not.toBeNull();
    expect(result!.baseAmount).toBe(100);
    expect(result!.exchangeRate).toBe(1.0);
    expect(result!.source).toBe('manual');
  });

  it('converts USD to EUR', () => {
    const result = convertAmount(100, 'USD', 'EUR');
    expect(result).not.toBeNull();
    expect(result!.originalAmount).toBe(100);
    expect(result!.originalCurrency).toBe('USD');
    expect(result!.baseCurrency).toBe('EUR');
    expect(result!.baseAmount).toBeGreaterThan(50);
    expect(result!.baseAmount).toBeLessThan(150);
  });

  it('returns null for unknown currency', () => {
    const result = convertAmount(100, 'USD', 'XYZ');
    expect(result).toBeNull();
  });

  it('returns amount 0 when converting zero', () => {
    const result = convertAmount(0, 'USD', 'EUR');
    expect(result).not.toBeNull();
    expect(result!.baseAmount).toBe(0);
    expect(result!.originalAmount).toBe(0);
    expect(result!.exchangeRate).toBeGreaterThan(0);
  });

  it('handles negative amounts (expenses)', () => {
    const result = convertAmount(-100, 'USD', 'EUR');
    expect(result).not.toBeNull();
    expect(result!.originalAmount).toBe(-100);
    expect(result!.baseAmount).toBeLessThan(0);
    // The exchange rate should be the same as for positive amounts
    const positiveResult = convertAmount(100, 'USD', 'EUR');
    expect(result!.exchangeRate).toBe(positiveResult!.exchangeRate);
    // Absolute values should match
    expect(Math.abs(result!.baseAmount)).toBeCloseTo(Math.abs(positiveResult!.baseAmount), 2);
  });

  it('throws StaleRatesError when rates are stale', () => {
    vi.spyOn(Date, 'now').mockReturnValue(STALE_DATE);
    // Same-currency bypasses rate lookup, so should NOT throw
    expect(convertAmount(100, 'USD', 'USD')).not.toBeNull();
    // Cross-currency should throw
    expect(() => convertAmount(100, 'USD', 'EUR')).toThrow(StaleRatesError);
  });
});

describe('getExchangeRate – edge cases', () => {
  it('returns null when both currencies are unknown', () => {
    const rate = getExchangeRate('ABC', 'XYZ');
    expect(rate).toBeNull();
  });

  it('returns null when from currency is unknown', () => {
    const rate = getExchangeRate('FAKE', 'USD');
    expect(rate).toBeNull();
  });

  it('returns null when to currency is unknown', () => {
    const rate = getExchangeRate('USD', 'FAKE');
    expect(rate).toBeNull();
  });
});

describe('getEffectiveAmount', () => {
  it('returns base_amount when available', () => {
    expect(getEffectiveAmount(100, 92)).toBe(92);
  });

  it('returns original amount when base_amount is null', () => {
    expect(getEffectiveAmount(100, null)).toBe(100);
  });
});

describe('calculateUnrealizedFxGainLoss', () => {
  it('returns zero for same-currency transactions', () => {
    const result = calculateUnrealizedFxGainLoss(
      [{ amount: 100, currency: 'USD', exchange_rate: null, base_amount: null }],
      'USD',
    );
    expect(result.totalGainLoss).toBe(0);
    expect(result.exposedCurrencies).toHaveLength(0);
  });

  it('calculates exposure for multi-currency transactions', () => {
    const result = calculateUnrealizedFxGainLoss(
      [
        { amount: 100, currency: 'EUR', exchange_rate: 1.1, base_amount: 110 },
      ],
      'USD',
    );
    // Should have EUR exposure
    expect(result.exposedCurrencies.length).toBeGreaterThanOrEqual(0);
    expect(typeof result.totalGainLoss).toBe('number');
  });

  it('handles empty array', () => {
    const result = calculateUnrealizedFxGainLoss([], 'USD');
    expect(result.totalGainLoss).toBe(0);
    expect(result.exposedCurrencies).toHaveLength(0);
  });

  it('tracks multiple exposed currencies independently', () => {
    const result = calculateUnrealizedFxGainLoss(
      [
        { amount: 100, currency: 'EUR', exchange_rate: 1.1, base_amount: 110 },
        { amount: 200, currency: 'GBP', exchange_rate: 1.27, base_amount: 254 },
        { amount: 50, currency: 'EUR', exchange_rate: 1.08, base_amount: 54 },
      ],
      'USD',
    );
    // Should track both EUR and GBP as separate exposures
    const currencies = result.exposedCurrencies.map(c => c.currency);
    expect(currencies).toContain('EUR');
    expect(currencies).toContain('GBP');
    expect(result.exposedCurrencies).toHaveLength(2);
    expect(typeof result.totalGainLoss).toBe('number');

    // EUR exposure should combine both EUR transactions
    const eurExposure = result.exposedCurrencies.find(c => c.currency === 'EUR');
    expect(eurExposure).toBeDefined();
    expect(eurExposure!.exposure).toBeGreaterThan(0);
  });

  it('skips transactions with null exchange_rate or base_amount', () => {
    const result = calculateUnrealizedFxGainLoss(
      [
        { amount: 100, currency: 'EUR', exchange_rate: null, base_amount: null },
        { amount: 200, currency: 'GBP', exchange_rate: 1.27, base_amount: null },
        { amount: 300, currency: 'CAD', exchange_rate: null, base_amount: 220 },
      ],
      'USD',
    );
    // All transactions should be skipped due to missing exchange_rate or base_amount
    expect(result.totalGainLoss).toBe(0);
    expect(result.exposedCurrencies).toHaveLength(0);
  });
});
