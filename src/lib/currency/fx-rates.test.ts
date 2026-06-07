import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fxRateProvider, _clearCache, _getFallbackRates } from './fx-rates';

// ─── Setup ──────────────────────────────────────────────────────────────────────

// Save original env
const originalEnv = { ...process.env };

beforeEach(() => {
  _clearCache();
  vi.restoreAllMocks();
  // Clear FX_RATE_API_URL so tests use fallback by default
  delete process.env.FX_RATE_API_URL;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ─── getRate ────────────────────────────────────────────────────────────────────

describe('fxRateProvider.getRate', () => {
  it('returns rate 1.0 for same currency', async () => {
    const result = await fxRateProvider.getRate('USD', 'USD');
    expect(result.rate).toBe(1.0);
    expect(result.from).toBe('USD');
    expect(result.to).toBe('USD');
    expect(result.source).toBe('cache');
  });

  it('returns rate 1.0 for same currency (case-insensitive)', async () => {
    const result = await fxRateProvider.getRate('usd', 'USD');
    expect(result.rate).toBe(1.0);
  });

  it('returns a fallback rate when no API configured', async () => {
    const result = await fxRateProvider.getRate('USD', 'EUR');
    expect(result.from).toBe('USD');
    expect(result.to).toBe('EUR');
    expect(result.rate).toBeGreaterThan(0);
    expect(result.source).toBe('fallback');
    expect(result.timestamp).toBeTruthy();
  });

  it('returns cached rate on second call', async () => {
    // First call populates cache from fallback
    const first = await fxRateProvider.getRate('USD', 'GBP');
    expect(first.source).toBe('fallback');

    // Second call should hit cache
    const second = await fxRateProvider.getRate('USD', 'GBP');
    expect(second.source).toBe('cache');
    expect(second.rate).toBe(first.rate);
  });

  it('fetches from API when FX_RATE_API_URL is set', async () => {
    process.env.FX_RATE_API_URL = 'https://api.exchangerate.host/latest';

    const mockResponse = {
      ok: true,
      json: async () => ({
        rates: { EUR: 0.91 },
      }),
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse as Response);

    const result = await fxRateProvider.getRate('USD', 'EUR');
    expect(result.source).toBe('api');
    expect(result.rate).toBe(0.91);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('falls back to static rates when API fails', async () => {
    process.env.FX_RATE_API_URL = 'https://api.exchangerate.host/latest';

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await fxRateProvider.getRate('USD', 'EUR');
    expect(result.source).toBe('fallback');
    expect(result.rate).toBeGreaterThan(0);
  });

  it('falls back when API returns non-OK status', async () => {
    process.env.FX_RATE_API_URL = 'https://api.exchangerate.host/latest';

    const mockResponse = { ok: false, status: 500 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse as Response);

    const result = await fxRateProvider.getRate('USD', 'AED');
    expect(result.source).toBe('fallback');
    expect(result.rate).toBeCloseTo(3.6725, 2);
  });

  it('throws for unknown currency pair not in fallback', async () => {
    await expect(fxRateProvider.getRate('USD', 'XYZ'))
      .rejects.toThrow('Unable to resolve FX rate');
  });

  it('computes cross-rates correctly via fallback', async () => {
    // EUR to GBP: EUR→USD = 1/0.92, USD→GBP = 0.79
    // Cross rate = 0.79 / 0.92 ≈ 0.8587
    const result = await fxRateProvider.getRate('EUR', 'GBP');
    expect(result.rate).toBeCloseTo(0.79 / 0.92, 2);
    expect(result.source).toBe('fallback');
  });
});

// ─── getRates ───────────────────────────────────────────────────────────────────

describe('fxRateProvider.getRates', () => {
  it('returns rates for multiple target currencies', async () => {
    const results = await fxRateProvider.getRates('USD', ['EUR', 'GBP', 'JPY']);
    expect(results).toHaveLength(3);

    const currencies = results.map((r) => r.to);
    expect(currencies).toContain('EUR');
    expect(currencies).toContain('GBP');
    expect(currencies).toContain('JPY');

    for (const rate of results) {
      expect(rate.from).toBe('USD');
      expect(rate.rate).toBeGreaterThan(0);
    }
  });

  it('includes same-currency with rate 1.0', async () => {
    const results = await fxRateProvider.getRates('USD', ['USD', 'EUR']);
    expect(results).toHaveLength(2);

    const usdRate = results.find((r) => r.to === 'USD');
    expect(usdRate).toBeDefined();
    expect(usdRate!.rate).toBe(1.0);
  });

  it('uses cache for already-fetched rates in batch', async () => {
    // Pre-populate cache
    await fxRateProvider.getRate('USD', 'EUR');

    const results = await fxRateProvider.getRates('USD', ['EUR', 'GBP']);
    const eurRate = results.find((r) => r.to === 'EUR');
    expect(eurRate?.source).toBe('cache');
  });

  it('batch-fetches from API for uncached targets', async () => {
    process.env.FX_RATE_API_URL = 'https://api.exchangerate.host/latest';

    const mockResponse = {
      ok: true,
      json: async () => ({
        rates: { EUR: 0.91, GBP: 0.78 },
      }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse as Response);

    const results = await fxRateProvider.getRates('USD', ['EUR', 'GBP']);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.source === 'api')).toBe(true);
  });
});

// ─── Cache TTL ──────────────────────────────────────────────────────────────────

describe('cache TTL behavior', () => {
  it('expires entries after TTL and re-fetches', async () => {
    // First call → fallback
    const first = await fxRateProvider.getRate('USD', 'CHF');
    expect(first.source).toBe('fallback');

    // Second call → cache
    const second = await fxRateProvider.getRate('USD', 'CHF');
    expect(second.source).toBe('cache');

    // Fast-forward time past 1 hour TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    const third = await fxRateProvider.getRate('USD', 'CHF');
    // After TTL, should fall back again (no API configured)
    expect(third.source).toBe('fallback');

    vi.useRealTimers();
  });
});

// ─── Fallback rates table ───────────────────────────────────────────────────────

describe('fallback rates table', () => {
  it('contains all 12 required currencies', () => {
    const rates = _getFallbackRates();
    const expected = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'CAD', 'AUD', 'JPY', 'CHF', 'INR', 'SGD', 'HKD'];
    for (const code of expected) {
      expect(rates).toHaveProperty(code);
      expect(rates[code]).toBeGreaterThan(0);
    }
  });
});
