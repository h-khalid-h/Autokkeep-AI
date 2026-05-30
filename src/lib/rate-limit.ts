import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from './redis';

interface RateLimitConfig {
  /** Max requests in the window */
  max: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key prefix for namespacing */
  prefix?: string;
}

// ── In-Memory Fallback Rate Limiter ──────────────────────────────────────────
// Used when Redis is unavailable. Simple fixed-window counter with TTL cleanup.
const memoryStore = new Map<string, { count: number; expiresAt: number }>();
const MEMORY_CLEANUP_INTERVAL = 60_000; // Clean expired entries every 60s
let lastCleanup = Date.now();

function memoryRateLimit(key: string, max: number, windowSeconds: number): { current: number; ttl: number } {
  const now = Date.now();

  // Periodic cleanup of expired entries
  if (now - lastCleanup > MEMORY_CLEANUP_INTERVAL) {
    lastCleanup = now;
    for (const [k, v] of memoryStore) {
      if (v.expiresAt <= now) memoryStore.delete(k);
    }
  }

  const existing = memoryStore.get(key);
  if (existing && existing.expiresAt > now) {
    existing.count++;
    return { current: existing.count, ttl: Math.ceil((existing.expiresAt - now) / 1000) };
  }

  // New window
  const expiresAt = now + windowSeconds * 1000;
  memoryStore.set(key, { count: 1, expiresAt });
  return { current: 1, ttl: windowSeconds };
}

/**
 * Sliding-window rate limiter using Redis with in-memory fallback.
 * Returns null if under limit, or a 429 NextResponse if over limit.
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const { max, windowSeconds, prefix = 'rl' } = config;

  // Use IP + path as the rate limit key
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || request.headers.get('x-real-ip') 
    || 'unknown';
  const path = new URL(request.url).pathname;
  const key = `${prefix}:${ip}:${path}`;

  let current: number;
  let ttl: number;

  try {
    const redis = getRedisClient();
    if (!redis) throw new Error('Redis not configured');
    current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    ttl = await redis.ttl(key);
  } catch (err) {
    // Redis is down — fall back to in-memory rate limiter
    console.warn('[RateLimit] Redis unavailable, using in-memory fallback:', err instanceof Error ? err.message : err);
    const result = memoryRateLimit(key, max, windowSeconds);
    current = result.current;
    ttl = result.ttl;
  }

  const _remaining = Math.max(0, max - current);

  if (current > max) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(ttl),
          'Retry-After': String(ttl),
        },
      }
    );
  }

  // Under limit — return null (proceed)
  return null;
}
