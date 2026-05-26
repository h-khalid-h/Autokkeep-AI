import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter (per-instance, resets on restart)
// For production, use Redis-backed rate limiting

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 60_000);

export function rateLimit(options: {
  maxRequests: number;
  windowMs: number;
}) {
  return function checkRateLimit(
    request: NextRequest,
    identifier?: string
  ): { allowed: boolean; remaining: number; resetAt: number } | null {
    const key = identifier || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous';
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      return { allowed: true, remaining: options.maxRequests - 1, resetAt: now + options.windowMs };
    }

    entry.count++;
    if (entry.count > options.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    return { allowed: true, remaining: options.maxRequests - entry.count, resetAt: entry.resetAt };
  };
}

// Pre-configured limiters for different route types
export const apiLimiter = rateLimit({ maxRequests: 100, windowMs: 60_000 }); // 100/min
export const authLimiter = rateLimit({ maxRequests: 10, windowMs: 60_000 });  // 10/min
export const webhookLimiter = rateLimit({ maxRequests: 200, windowMs: 60_000 }); // 200/min
export const aiLimiter = rateLimit({ maxRequests: 20, windowMs: 60_000 });   // 20/min
