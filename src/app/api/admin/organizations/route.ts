// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/organizations — Paginated organization list
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

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscription_status: string;
  created_at: string;
}

interface EntityRow {
  id: string;
  org_id: string;
}



export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'admin-orgs' });
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

    // ── Parse query params ────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const search = searchParams.get('search') || '';
    const offset = (page - 1) * limit;

    // ── Admin client for cross-org queries ────────────────────────────────────
    const admin = createAdminClient() as unknown as SupabaseQueryClient;

    // ── Fetch organizations ───────────────────────────────────────────────────
    let orgQuery = admin
      .from('organizations')
      .select('id, name, slug, plan, subscription_status, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      const sanitized = search.replace(/[\\%_]/g, (c: string) => `\\${c}`).slice(0, 100);
      if (sanitized.length > 0) {
        orgQuery = orgQuery.or(`name.ilike.%${sanitized}%,slug.ilike.%${sanitized}%`);
      }
    }

    const { data: orgs, error: orgError, count } = await orgQuery;

    if (orgError) {
      console.error('[Admin/Organizations] Query error:', orgError);
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    const orgList = (orgs || []) as OrgRow[];

    if (orgList.length === 0) {
      return NextResponse.json({
        organizations: [],
        pagination: { total: count || 0, page, limit, hasMore: false },
      });
    }

    // ── Fetch entity + transaction counts per org ─────────────────────────────
    const orgIds = orgList.map((o) => o.id);

    // Fetch entities for only the orgs on this page
    const { data: entitiesData } = await admin
      .from('entities')
      .select('id, org_id')
      .in('org_id', orgIds);

    const entities = (entitiesData || []) as EntityRow[];

    // Build lookup maps
    const entityCountByOrg: Record<string, number> = {};
    const entityIdsByOrg: Record<string, string[]> = {};
    const allEntityIds: string[] = [];
    for (const e of entities) {
      entityCountByOrg[e.org_id] = (entityCountByOrg[e.org_id] || 0) + 1;
      if (!entityIdsByOrg[e.org_id]) entityIdsByOrg[e.org_id] = [];
      entityIdsByOrg[e.org_id].push(e.id);
      allEntityIds.push(e.id);
    }

    // Count transactions and get last activity ONLY for the relevant entity IDs
    const txCountByOrg: Record<string, number> = {};
    const lastActivityByOrg: Record<string, string> = {};

    if (allEntityIds.length > 0) {
      // Use count queries per org instead of loading all transactions
      const txCountPromises = orgList.map(async (org) => {
        const orgEntityIds = entityIdsByOrg[org.id] || [];
        if (orgEntityIds.length === 0) return;

        const [countResult, lastResult] = await Promise.all([
          admin.from('transactions').select('id', { count: 'exact', head: true })
            .in('entity_id', orgEntityIds),
          admin.from('transactions').select('created_at')
            .in('entity_id', orgEntityIds)
            .order('created_at', { ascending: false })
            .limit(1),
        ]);

        txCountByOrg[org.id] = countResult.count || 0;
        if (lastResult.data?.[0]) {
          lastActivityByOrg[org.id] = lastResult.data[0].created_at;
        }
      });
      await Promise.all(txCountPromises);
    }

    // ── Build response ────────────────────────────────────────────────────────
    const organizations = orgList.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      status: org.subscription_status,
      createdAt: org.created_at,
      entityCount: entityCountByOrg[org.id] || 0,
      transactionCount: txCountByOrg[org.id] || 0,
      lastActivity: lastActivityByOrg[org.id] || null,
    }));

    return NextResponse.json({
      organizations,
      pagination: {
        total: count || 0,
        page,
        limit,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    captureException(error, { tags: { route: 'admin-organizations' } });
    return NextResponse.json(
      { error: 'Failed to fetch organizations' },
      { status: 500 }
    );
  }
}
