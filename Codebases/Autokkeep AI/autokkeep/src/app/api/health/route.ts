import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/health — Health check endpoint
 * Returns service status for monitoring, load balancers, and Easypanel.
 */
export async function GET() {
  const start = Date.now();
  const checks: Record<string, { status: string; latency?: number }> = {};

  // 1. Database connectivity
  try {
    const dbStart = Date.now();
    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    checks.database = {
      status: error ? 'degraded' : 'healthy',
      latency: Date.now() - dbStart,
    };
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

  // 3. Overall status
  const overallHealthy = Object.values(checks).every(
    (c) => c.status === 'healthy'
  );

  return NextResponse.json(
    {
      status: overallHealthy ? 'healthy' : 'degraded',
      version: process.env.npm_package_version || '2.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      latency: Date.now() - start,
      checks,
    },
    { status: overallHealthy ? 200 : 503 }
  );
}
