// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Database & System Health Monitor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Provides comprehensive health checks for the database, Redis, and the Node.js
// runtime. Used by /api/health/detailed for admin-only monitoring.

import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { createLogger } from '@/lib/logger';

const log = createLogger('health-monitor');

// ── Types ────────────────────────────────────────────────────────────────────

export interface DatabaseHealthStatus {
  connected: boolean;
  responseTimeMs: number;
  poolStats: {
    active: number;
    idle: number;
    waiting: number;
    maxConnections: number;
  };
  supabaseProjectRef: string | null;
  timestamp: string;
}

export interface SystemHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: DatabaseHealthStatus;
  redis: { connected: boolean; responseTimeMs: number };
  uptime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  version: string;
  environment: string;
  timestamp: string;
}

// ── Estimated Pool Tracking ─────────────────────────────────────────────────
// Supabase manages connection pooling server-side (PgBouncer). We track
// estimated client-side usage for observability — not actual pool state.

let estimatedActiveConnections = 0;
let _totalQueriesExecuted = 0;

function trackQueryStart() {
  estimatedActiveConnections++;
  _totalQueriesExecuted++;
}

function trackQueryEnd() {
  estimatedActiveConnections = Math.max(0, estimatedActiveConnections - 1);
}

// ── Database Health ─────────────────────────────────────────────────────────

/**
 * Checks database connectivity by running a `SELECT 1` equivalent via Supabase.
 * Measures round-trip response time and reports pool statistics.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthStatus> {
  const start = performance.now();
  let connected = false;

  trackQueryStart();
  try {
    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Simple connectivity check — SELECT 1 via rpc or a lightweight query
    const { error } = await db.rpc('version').maybeSingle();

    if (error) {
      // Fallback: try a head-only query
      const { error: fallbackError } = await db
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      connected = !fallbackError;
    } else {
      connected = true;
    }
  } catch (err) {
    log.error('Database health check failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    connected = false;
  } finally {
    trackQueryEnd();
  }

  const responseTimeMs = Math.round((performance.now() - start) * 100) / 100;

  // Extract project ref from SUPABASE_URL (e.g. https://abc123.supabase.co → abc123)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRefMatch = supabaseUrl.match(/https?:\/\/([^.]+)\./);
  const supabaseProjectRef = projectRefMatch?.[1] ?? null;

  return {
    connected,
    responseTimeMs,
    poolStats: {
      active: estimatedActiveConnections,
      idle: Math.max(0, 10 - estimatedActiveConnections), // Estimated pool size
      waiting: 0,
      maxConnections: 10, // Supabase default PgBouncer pool
    },
    supabaseProjectRef,
    timestamp: new Date().toISOString(),
  };
}

// ── Redis Health ────────────────────────────────────────────────────────────

/**
 * Checks Redis connectivity by sending a PING command.
 * Returns connected=false if Redis is not configured or unreachable.
 */
export async function checkRedisHealth(): Promise<{ connected: boolean; responseTimeMs: number }> {
  const start = performance.now();

  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return { connected: false, responseTimeMs: 0 };
    }

    const { getRedisClient } = await import('@/lib/redis');
    const redis = getRedisClient();

    if (!redis) {
      return { connected: false, responseTimeMs: 0 };
    }

    await redis.ping();
    const responseTimeMs = Math.round((performance.now() - start) * 100) / 100;

    return { connected: true, responseTimeMs };
  } catch (err) {
    log.warn('Redis health check failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    const responseTimeMs = Math.round((performance.now() - start) * 100) / 100;
    return { connected: false, responseTimeMs };
  }
}

// ── System Health ───────────────────────────────────────────────────────────

/**
 * Aggregates health checks across all subsystems into a single report.
 *
 * Status logic:
 * - **healthy**: All systems operational
 * - **degraded**: Database up but Redis down (non-critical service)
 * - **unhealthy**: Database unreachable
 */
export async function getSystemHealth(): Promise<SystemHealthReport> {
  const [database, redis] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const memUsage = process.memoryUsage();

  // Determine overall status
  let status: SystemHealthReport['status'];
  if (!database.connected) {
    status = 'unhealthy';
  } else if (!redis.connected) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  return {
    status,
    database,
    redis,
    uptime: process.uptime(),
    memoryUsage: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
    },
    version: process.env.npm_package_version || '2.2.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  };
}
