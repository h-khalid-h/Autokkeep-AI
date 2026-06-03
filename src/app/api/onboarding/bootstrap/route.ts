// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DEPRECATED: This route is a server-side wrapper for the `bootstrap_onboarding`
// SECURITY DEFINER RPC function. It should be deprecated in favor of direct RPC
// calls from the client via supabase.rpc('bootstrap_onboarding', {...}).
//
// Idempotency for entity creation is handled by the RPC itself — it checks for
// an existing entity with the same name in the org before inserting a new one.
// See: src/lib/supabase/migrations/016_bootstrap_onboarding_rpc.sql
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getApiAuthContext } from '@/lib/api-auth';
import { parseBody, schemas } from '@/lib/validation';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// POST /api/onboarding/bootstrap — Create org + entity with validated input
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'onboarding-bootstrap' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { db } = ctx;

    const parsed = await parseBody(request, schemas.onboardingBootstrap);
    if (!parsed.success) return parsed.error;
    const { entityName, fiscalYearEnd, currency } = parsed.data;

    // ── Call the bootstrap_onboarding SECURITY DEFINER function ────────────
    const sanitizedEntityName = entityName.trim();

    const { data: result, error: rpcError } = await (db as unknown as SupabaseQueryClient)
      .rpc('bootstrap_onboarding', {
        p_entity_name: sanitizedEntityName,
        p_fiscal_year_end: fiscalYearEnd,
        p_currency: currency,
      });

    if (rpcError || !result) {
      console.error('[Bootstrap] RPC error:', rpcError);
      return NextResponse.json(
        { error: rpcError?.message || 'Failed to create entity. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      orgId: result.orgId,
      entityId: result.entityId,
    });
  } catch (error) {
    console.error('[Bootstrap] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during onboarding' },
      { status: 500 }
    );
  }
}
