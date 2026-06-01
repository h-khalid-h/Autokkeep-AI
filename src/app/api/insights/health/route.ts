
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/PATCH /api/insights/health — Financial Health Monitoring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';
import { runHealthCheck, computeHealthScore } from '@/lib/ai/health-monitor';
import type { HealthAlert } from '@/lib/ai/health-monitor';

// ─── GET: Run or return cached health alerts ───────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'health-check' });
    if (limited) return limited;

    const supabase = await createServerClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const forceRefresh = searchParams.get('refresh') === 'true';

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    // Validate org membership and entity access
    const { data: membership } = await db
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: entity } = await db
      .from('entities')
      .select('id, org_id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Check for cached alerts from the last 24 hours (unless force refresh)
    if (!forceRefresh) {
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const { data: cachedAlerts, error: cacheError } = await db
        .from('health_alerts')
        .select('*')
        .eq('entity_id', entityId)
        .eq('is_dismissed', false)
        .gte('created_at', oneDayAgo.toISOString())
        .order('created_at', { ascending: false });

      if (!cacheError && cachedAlerts && cachedAlerts.length > 0) {
        const mapped = mapAlerts(cachedAlerts, entityId);
        const sorted = sortBySeverity(mapped);
        const score = computeHealthScore(sorted);

        return NextResponse.json({
          alerts: sorted,
          healthScore: score,
          cached: true,
          alertCount: {
            critical: sorted.filter((a) => a.severity === 'critical').length,
            warning: sorted.filter((a) => a.severity === 'warning').length,
            info: sorted.filter((a) => a.severity === 'info').length,
          },
        });
      }
    }

    // Run fresh health check
    const alerts = await runHealthCheck(entityId, db);
    const sorted = sortBySeverity(alerts);
    const score = computeHealthScore(sorted);

    return NextResponse.json({
      alerts: sorted,
      healthScore: score,
      cached: false,
      alertCount: {
        critical: sorted.filter((a) => a.severity === 'critical').length,
        warning: sorted.filter((a) => a.severity === 'warning').length,
        info: sorted.filter((a) => a.severity === 'info').length,
      },
    });
  } catch (error) {
    console.error('[Insights/Health] Error:', error);
    return NextResponse.json(
      { error: 'Failed to run health check' },
      { status: 500 }
    );
  }
}

// ─── PATCH: Mark alert as read or dismissed ────────────────────────────────

interface PatchBody {
  alertId: string;
  action: 'read' | 'dismiss';
}

export async function PATCH(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'health-patch' });
    if (limited) return limited;

    const supabase = await createServerClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: PatchBody = await request.json();

    if (!body.alertId || !body.action) {
      return NextResponse.json(
        { error: 'alertId and action are required' },
        { status: 400 }
      );
    }

    if (body.action !== 'read' && body.action !== 'dismiss') {
      return NextResponse.json(
        { error: 'action must be "read" or "dismiss"' },
        { status: 400 }
      );
    }

    // Validate the user has access to the entity owning this alert
    const { data: alert } = await db
      .from('health_alerts')
      .select('id, entity_id')
      .eq('id', body.alertId)
      .single();

    if (!alert) {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    // Check entity access
    const { data: membership } = await db
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: entity } = await db
      .from('entities')
      .select('id')
      .eq('id', alert.entity_id)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Access denied to this alert' },
        { status: 403 }
      );
    }

    // Apply the update
    const update =
      body.action === 'read'
        ? { is_read: true }
        : { is_dismissed: true };

    const { error: updateError } = await db
      .from('health_alerts')
      .update(update)
      .eq('id', body.alertId);

    if (updateError) {
      console.error('[Insights/Health] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update alert' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, alertId: body.alertId, action: body.action });
  } catch (error) {
    console.error('[Insights/Health] PATCH Error:', error);
    return NextResponse.json(
      { error: 'Failed to update alert' },
      { status: 500 }
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface AlertRow {
  id: string;
  entity_id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  data: Record<string, unknown>;
  is_read: boolean;
  is_dismissed: boolean;
}

function mapAlerts(rows: AlertRow[], entityId: string): HealthAlert[] {
  return rows.map((row) => ({
    id: row.id,
    entityId: row.entity_id || entityId,
    alertType: row.alert_type as HealthAlert['alertType'],
    severity: row.severity as HealthAlert['severity'],
    title: row.title,
    description: row.description,
    data: row.data || {},
    isRead: row.is_read,
    isDismissed: row.is_dismissed,
  }));
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function sortBySeverity(alerts: HealthAlert[]): HealthAlert[] {
  return [...alerts].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
  );
}
