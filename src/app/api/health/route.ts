import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/health — Health check endpoint
 * Returns service status for monitoring, load balancers, and Easypanel.
 * Detailed info is only exposed to authenticated requests (CRON_SECRET).
 */
export async function GET(request: NextRequest) {
  try {
    const start = Date.now();
    const checks: Record<string, { status: string; latency?: number }> = {};

    // 1. Database connectivity
    try {
      const dbStart = Date.now();
      const supabase = createAdminClient();
      const db = supabase as unknown as SupabaseQueryClient;
      // Use a simple query that doesn't depend on any specific table
      const { error } = await db.rpc('version').maybeSingle();

      if (error) {
        // Fallback: try a simple from() query
        const { error: fallbackError } = await db
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .limit(1);
        checks.database = {
          status: fallbackError ? 'degraded' : 'healthy',
          latency: Date.now() - dbStart,
        };
      } else {
        checks.database = {
          status: 'healthy',
          latency: Date.now() - dbStart,
        };
      }
    } catch {
      checks.database = { status: 'unhealthy' };
    }

    // 2. Environment variables
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ];
    const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
    checks.environment = {
      status: missingEnvVars.length === 0 ? 'healthy' : 'degraded',
    };

    // 3. Redis connectivity
    try {
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        const redisStart = Date.now();
        const { default: Redis } = await import('ioredis');
        const redis = new Redis(redisUrl, { connectTimeout: 3000 });
        await redis.ping();
        checks.redis = {
          status: 'connected',
          latency: Date.now() - redisStart,
        };
        await redis.quit();
      } else {
        checks.redis = { status: 'not_configured' };
      }
    } catch {
      checks.redis = { status: 'disconnected' };
    }

    // 4. Overall status
    const healthyStatuses = ['healthy', 'connected', 'not_configured'];
    const overallHealthy = Object.values(checks).every(
      (c) => healthyStatuses.includes(c.status)
    );

    const status = overallHealthy ? 'healthy' : 'degraded';
    const httpStatus = overallHealthy ? 200 : 503;

    // Gate detailed info behind CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (isAuthorized) {
      return NextResponse.json(
        {
          status,
          version: process.env.npm_package_version || '2.0.0',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          latency: Date.now() - start,
          checks,
        },
        { status: httpStatus }
      );
    }

    // Unauthenticated: minimal response
    return NextResponse.json(
      {
        status,
        timestamp: new Date().toISOString(),
      },
      { status: httpStatus }
    );
  } catch (error) {
    console.error('[Health] Unexpected error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: 'Health check failed unexpectedly',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
