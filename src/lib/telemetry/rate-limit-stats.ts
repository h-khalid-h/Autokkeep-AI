// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Rate Limit Statistics Collector
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// In-memory collector that tracks rate limit usage per endpoint.
// Used by the admin dashboard to display throttle rates and hotspots.

// ── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitStat {
  endpoint: string;
  totalRequests: number;
  throttledRequests: number;
  throttleRate: number;
  lastThrottledAt: string | null;
  windowSeconds: number;
  maxRequests: number;
}

export interface RateLimitStatsCollector {
  recordRequest(
    endpoint: string,
    wasThrottled: boolean,
    config: { max: number; windowSeconds: number }
  ): void;
  getStats(): RateLimitStat[];
  getEndpointStats(endpoint: string): RateLimitStat | undefined;
  reset(): void;
}

// ── Internal State ───────────────────────────────────────────────────────────

interface EndpointCounter {
  totalRequests: number;
  throttledRequests: number;
  lastThrottledAt: string | null;
  windowSeconds: number;
  maxRequests: number;
}

// ── Collector Implementation ─────────────────────────────────────────────────

class RateLimitStatsCollectorImpl implements RateLimitStatsCollector {
  private stats = new Map<string, EndpointCounter>();

  recordRequest(
    endpoint: string,
    wasThrottled: boolean,
    config: { max: number; windowSeconds: number }
  ): void {
    let entry = this.stats.get(endpoint);
    if (!entry) {
      entry = {
        totalRequests: 0,
        throttledRequests: 0,
        lastThrottledAt: null,
        windowSeconds: config.windowSeconds,
        maxRequests: config.max,
      };
      this.stats.set(endpoint, entry);
    }

    entry.totalRequests++;
    // Always update config in case it changed
    entry.windowSeconds = config.windowSeconds;
    entry.maxRequests = config.max;

    if (wasThrottled) {
      entry.throttledRequests++;
      entry.lastThrottledAt = new Date().toISOString();
    }
  }

  getStats(): RateLimitStat[] {
    const result: RateLimitStat[] = [];

    for (const [endpoint, counter] of this.stats) {
      result.push({
        endpoint,
        totalRequests: counter.totalRequests,
        throttledRequests: counter.throttledRequests,
        throttleRate:
          counter.totalRequests > 0
            ? Math.round((counter.throttledRequests / counter.totalRequests) * 10000) / 100
            : 0,
        lastThrottledAt: counter.lastThrottledAt,
        windowSeconds: counter.windowSeconds,
        maxRequests: counter.maxRequests,
      });
    }

    // Sort by throttle rate descending — hottest endpoints first
    return result.sort((a, b) => b.throttleRate - a.throttleRate);
  }

  getEndpointStats(endpoint: string): RateLimitStat | undefined {
    const counter = this.stats.get(endpoint);
    if (!counter) return undefined;

    return {
      endpoint,
      totalRequests: counter.totalRequests,
      throttledRequests: counter.throttledRequests,
      throttleRate:
        counter.totalRequests > 0
          ? Math.round((counter.throttledRequests / counter.totalRequests) * 10000) / 100
          : 0,
      lastThrottledAt: counter.lastThrottledAt,
      windowSeconds: counter.windowSeconds,
      maxRequests: counter.maxRequests,
    };
  }

  reset(): void {
    this.stats.clear();
  }
}

// ── Singleton Export ─────────────────────────────────────────────────────────

/** Singleton rate limit stats collector for the application */
export const rateLimitStats: RateLimitStatsCollector = new RateLimitStatsCollectorImpl();
