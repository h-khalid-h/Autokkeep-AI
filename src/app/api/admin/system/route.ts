// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/system — System health & configuration status
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/admin';
import { captureException } from '@/lib/sentry';
import { rateLimit } from '@/lib/rate-limit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Environment variables to check — grouped by integration */
const ENV_GROUPS: { group: string; vars: string[] }[] = [
  {
    group: 'Supabase',
    vars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  },
  {
    group: 'OpenAI',
    vars: ['OPENAI_API_KEY'],
  },
  {
    group: 'Plaid',
    vars: ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV'],
  },
  {
    group: 'Stripe',
    vars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  },
  {
    group: 'Messaging',
    vars: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'TWILIO_ACCOUNT_SID'],
  },
  {
    group: 'Cron',
    vars: ['CRON_SECRET'],
  },
  {
    group: 'Email',
    vars: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'],
  },
  {
    group: 'Redis',
    vars: ['REDIS_URL'],
  },
  {
    group: 'Sentry',
    vars: ['NEXT_PUBLIC_SENTRY_DSN'],
  },
  {
    group: 'Security',
    vars: ['TOKEN_ENCRYPTION_KEY'],
  },
  {
    group: 'Admin',
    vars: ['ADMIN_EMAILS'],
  },
];

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'admin-system' });
    if (limited) return limited;
    // ── Auth check ────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Database health check ─────────────────────────────────────────────────
    let dbStatus: 'healthy' | 'degraded' | 'unhealthy' = 'unhealthy';
    let dbLatencyMs = 0;

    try {
      const dbStart = Date.now();
      const admin = createAdminClient() as unknown as SupabaseQueryClient;
      const { error: dbError } = await admin
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      dbLatencyMs = Date.now() - dbStart;
      dbStatus = dbError ? 'degraded' : 'healthy';
    } catch {
      dbStatus = 'unhealthy';
    }

    // ── Redis health check ────────────────────────────────────────────────────
    let redisStatus: 'connected' | 'not_configured' | 'disconnected' = 'not_configured';
    if (process.env.REDIS_URL) {
      try {
        // Use singleton client to avoid connection leak per health check
        const { getRedisClient } = await import('@/lib/redis');
        const redis = getRedisClient();
        if (redis) {
          await redis.ping();
          redisStatus = 'connected';
        } else {
          redisStatus = 'disconnected';
        }
      } catch {
        redisStatus = 'disconnected';
      }
    }

    // Reuse admin client for all subsequent queries
    const admin = createAdminClient() as unknown as SupabaseQueryClient;
    let lastTransactionSync: string | null = null;

    try {
      const { data: latestTx } = await admin
        .from('transactions')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestTx) {
        lastTransactionSync = (latestTx as { created_at: string }).created_at;
      }
    } catch {
      // Non-critical
    }

    // ── Audit log: recent error/system activity ───────────────────────────────
    let recentAuditActions = 0;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const { count } = await admin
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo);

      recentAuditActions = count || 0;
    } catch {
      // Non-critical
    }

    // ── Environment variable status (F28: grouped booleans, no var names) ─────
    const envStatus: Record<string, boolean> = {};
    for (const group of ENV_GROUPS) {
      envStatus[group.group.toLowerCase()] = group.vars.every((v) => !!process.env[v]);
    }

    return NextResponse.json({
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      redis: {
        status: redisStatus,
      },
      cron: {
        lastTransactionSync,
      },
      audit: {
        actionsLast24h: recentAuditActions,
      },
      environment: envStatus,
    });
  } catch (error) {
    captureException(error, { tags: { route: 'admin-system' } });
    return NextResponse.json(
      { error: 'Failed to fetch system status' },
      { status: 500 }
    );
  }
}
