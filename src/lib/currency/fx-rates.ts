// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — FX Rate Provider
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Pluggable FX rate service with:
//   1. In-memory cache (1-hour TTL)
//   2. External API fetching (configurable via FX_RATE_API_URL env var)
//   3. Hardcoded fallback rates for when API is unavailable
//
// Lookup order: cache → API → fallback

// ─── Public Interfaces ─────────────────────────────────────────────────────────

export interface FXRate {
  from: string;
  to: string;
  rate: number;
  timestamp: string;
  source: 'cache' | 'api' | 'fallback';
}

export interface FXRateProvider {
  getRate(from: string, to: string): Promise<FXRate>;
  getRates(baseCurrency: string, targets: string[]): Promise<FXRate[]>;
}

// ─── Cache ──────────────────────────────────────────────────────────────────────

interface CachedRate {
  rate: number;
  timestamp: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Simple in-memory FX rate cache keyed by "FROM→TO".
 * Each entry expires after CACHE_TTL_MS.
 */
const rateCache = new Map<string, CachedRate>();

function cacheKey(from: string, to: string): string {
  return `${from}→${to}`;
}

function getCached(from: string, to: string): CachedRate | null {
  const key = cacheKey(from, to);
  const entry = rateCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    rateCache.delete(key);
    return null;
  }
  return entry;
}

function setCache(from: string, to: string, rate: number, timestamp: string): void {
  rateCache.set(cacheKey(from, to), {
    rate,
    timestamp,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ─── Fallback Static Rates ──────────────────────────────────────────────────────
// All rates expressed as: 1 USD = X target currency.
// These serve as last-resort when no API is configured or reachable.

const FALLBACK_RATES_USD: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.6725,
  SAR: 3.75,
  CAD: 1.36,
  AUD: 1.53,
  JPY: 149.5,
  CHF: 0.88,
  INR: 83.12,
  SGD: 1.34,
  HKD: 7.82,
};

/**
 * Compute a cross rate from the fallback table.
 * Both `from` and `to` must be present in FALLBACK_RATES_USD.
 * Returns null if either currency is unknown.
 */
function getFallbackRate(from: string, to: string): number | null {
  const fromRate = FALLBACK_RATES_USD[from];
  const toRate = FALLBACK_RATES_USD[to];
  if (fromRate == null || toRate == null) return null;
  // Cross rate: 1 FROM → USD → TO
  return toRate / fromRate;
}

// ─── External API ───────────────────────────────────────────────────────────────

/**
 * Fetches rates from an external FX API.
 * Returns a map of target → rate, or null on failure.
 */
async function fetchFromApi(
  baseCurrency: string,
  targets: string[]
): Promise<Map<string, number> | null> {
  const apiUrl = process.env.FX_RATE_API_URL;
  if (!apiUrl) return null;

  try {
    const symbols = targets.join(',');
    const url = `${apiUrl}?base=${baseCurrency}&symbols=${symbols}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) return null;

    const data = await response.json();
    // exchangerate.host returns { rates: { EUR: 0.92, ... } }
    if (!data?.rates || typeof data.rates !== 'object') return null;

    const result = new Map<string, number>();
    for (const [currency, rate] of Object.entries(data.rates)) {
      if (typeof rate === 'number' && rate > 0) {
        result.set(currency, rate);
      }
    }
    return result.size > 0 ? result : null;
  } catch {
    // Network error, timeout, etc.
    return null;
  }
}

// ─── Provider Implementation ────────────────────────────────────────────────────

class DefaultFXRateProvider implements FXRateProvider {
  /**
   * Get a single FX rate.
   * Lookup order: cache → API → fallback static rates.
   */
  async getRate(from: string, to: string): Promise<FXRate> {
    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();

    // Same currency → always 1.0
    if (fromUpper === toUpper) {
      return {
        from: fromUpper,
        to: toUpper,
        rate: 1.0,
        timestamp: new Date().toISOString(),
        source: 'cache',
      };
    }

    // 1. Check cache
    const cached = getCached(fromUpper, toUpper);
    if (cached) {
      return {
        from: fromUpper,
        to: toUpper,
        rate: cached.rate,
        timestamp: cached.timestamp,
        source: 'cache',
      };
    }

    // 2. Try external API
    const apiRates = await fetchFromApi(fromUpper, [toUpper]);
    if (apiRates) {
      const apiRate = apiRates.get(toUpper);
      if (apiRate != null) {
        const timestamp = new Date().toISOString();
        setCache(fromUpper, toUpper, apiRate, timestamp);
        return {
          from: fromUpper,
          to: toUpper,
          rate: apiRate,
          timestamp,
          source: 'api',
        };
      }
    }

    // 3. Fallback to static rates
    const fallbackRate = getFallbackRate(fromUpper, toUpper);
    if (fallbackRate != null) {
      const timestamp = new Date().toISOString();
      setCache(fromUpper, toUpper, fallbackRate, timestamp);
      return {
        from: fromUpper,
        to: toUpper,
        rate: fallbackRate,
        timestamp,
        source: 'fallback',
      };
    }

    // Unknown currency pair — throw
    throw new Error(
      `Unable to resolve FX rate for ${fromUpper}→${toUpper}: not available in API or fallback table`
    );
  }

  /**
   * Get rates for multiple target currencies from a single base.
   */
  async getRates(baseCurrency: string, targets: string[]): Promise<FXRate[]> {
    const baseUpper = baseCurrency.toUpperCase();

    // Separate cached vs uncached targets
    const results: FXRate[] = [];
    const uncachedTargets: string[] = [];

    for (const target of targets) {
      const tUpper = target.toUpperCase();
      if (tUpper === baseUpper) {
        results.push({
          from: baseUpper,
          to: tUpper,
          rate: 1.0,
          timestamp: new Date().toISOString(),
          source: 'cache',
        });
        continue;
      }

      const cached = getCached(baseUpper, tUpper);
      if (cached) {
        results.push({
          from: baseUpper,
          to: tUpper,
          rate: cached.rate,
          timestamp: cached.timestamp,
          source: 'cache',
        });
      } else {
        uncachedTargets.push(tUpper);
      }
    }

    if (uncachedTargets.length === 0) return results;

    // Try batch API fetch for all uncached
    const apiRates = await fetchFromApi(baseUpper, uncachedTargets);
    const stillMissing: string[] = [];

    for (const target of uncachedTargets) {
      const apiRate = apiRates?.get(target);
      if (apiRate != null) {
        const timestamp = new Date().toISOString();
        setCache(baseUpper, target, apiRate, timestamp);
        results.push({
          from: baseUpper,
          to: target,
          rate: apiRate,
          timestamp,
          source: 'api',
        });
      } else {
        stillMissing.push(target);
      }
    }

    // Fallback for anything still missing
    for (const target of stillMissing) {
      const fallbackRate = getFallbackRate(baseUpper, target);
      if (fallbackRate != null) {
        const timestamp = new Date().toISOString();
        setCache(baseUpper, target, fallbackRate, timestamp);
        results.push({
          from: baseUpper,
          to: target,
          rate: fallbackRate,
          timestamp,
          source: 'fallback',
        });
      } else {
        throw new Error(
          `Unable to resolve FX rate for ${baseUpper}→${target}: not available in API or fallback table`
        );
      }
    }

    return results;
  }
}

// ─── Exported Singleton ─────────────────────────────────────────────────────────

export const fxRateProvider: FXRateProvider = new DefaultFXRateProvider();

// ─── Test Helpers ───────────────────────────────────────────────────────────────
// Exposed for unit tests only — not part of the public API.

/** @internal Clear the in-memory rate cache (used in tests). */
export function _clearCache(): void {
  rateCache.clear();
}

/** @internal Get the fallback rate table for assertions. */
export function _getFallbackRates(): Record<string, number> {
  return { ...FALLBACK_RATES_USD };
}
