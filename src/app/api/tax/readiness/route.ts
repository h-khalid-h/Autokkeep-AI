
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/tax/readiness — Tax Readiness Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';
import { analyzeTaxReadiness } from '@/lib/tax/readiness';

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 10 requests per minute
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'tax-readiness' });
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
    const yearStr = searchParams.get('taxYear');

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    const taxYear = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

    if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
      return NextResponse.json(
        { error: 'taxYear must be between 2000 and 2100' },
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

    // Run tax readiness analysis
    const report = await analyzeTaxReadiness(entityId, taxYear, db);

    return NextResponse.json({ report });
  } catch (error) {
    console.error('[Tax/Readiness] Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze tax readiness' },
      { status: 500 }
    );
  }
}
