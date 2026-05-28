import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from './redis';

interface RateLimitConfig {
  /** Max requests in the window */
  max: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key prefix for namespacing */
  prefix?: string;
}

/**
 * Sliding-window rate limiter using Redis.
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

  try {
    const redis = getRedis();
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, max - current);
    const ttl = await redis.ttl(key);

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
  } catch (err) {
    // If Redis is down, fail open (allow the request)
    console.error('[RateLimit] Redis error, failing open:', err);
    return null;
  }
}
