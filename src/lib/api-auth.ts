// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — API Auth Context Helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Centralizes auth + org membership resolution for API routes.
// Replaces ad-hoc `.single()` calls that would fail for multi-org users.
//
// Usage:
//   const ctx = await getApiAuthContext(request);
//   if (ctx.error) return ctx.error;
//   const { user, membership, db } = ctx;

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

export interface ApiAuthContext {
  user: { id: string; email?: string };
  membership: { id: string; org_id: string; role: string };
  db: SupabaseQueryClient;
  /** Entity IDs for the user's current org */
  entityIds: string[];
  error?: never;
}

export interface ApiAuthError {
  error: NextResponse;
  user?: never;
  membership?: never;
  db?: never;
  entityIds?: never;
}

/**
 * Resolves auth user and org membership for an API route.
 *
 * Multi-org safe: uses `.limit(1)` instead of `.single()`.
 * If the request includes an `x-org-id` header, that org is used
 * (validated against user's memberships). Otherwise, the first
 * membership is returned.
 *
 * @param request - The incoming NextRequest
 * @param options.requireRole - If set, the user must have this role or higher
 * @returns ApiAuthContext on success, ApiAuthError on failure
 */
export async function getApiAuthContext(
  request?: NextRequest | Request,
  options: { requireRole?: ('owner' | 'admin' | 'accountant' | 'viewer')[] } = {}
): Promise<ApiAuthContext | ApiAuthError> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }

    const db = supabase as unknown as SupabaseQueryClient;

    // Resolve org membership — multi-org safe
    // If x-org-id header is provided, use that org specifically
    const orgIdHeader = request?.headers?.get('x-org-id');
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validOrgId = orgIdHeader && UUID_RE.test(orgIdHeader) ? orgIdHeader : null;

    let membership: { id: string; org_id: string; role: string } | null = null;

    if (validOrgId) {
      // Validate user belongs to the requested org
      const { data } = await db
        .from('team_members')
        .select('id, org_id, role')
        .eq('user_id', user.id)
        .eq('org_id', validOrgId)
        .limit(1);

      membership = data?.[0] ?? null;
    } else {
      // Default: use first membership (backwards compatible with single-org)
      const { data } = await db
        .from('team_members')
        .select('id, org_id, role')
        .eq('user_id', user.id)
        .limit(1);

      membership = data?.[0] ?? null;
    }

    if (!membership) {
      return {
        error: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
      };
    }

    // Role check
    if (options.requireRole && !options.requireRole.includes(membership.role as 'owner' | 'admin' | 'accountant' | 'viewer')) {
      return {
        error: NextResponse.json(
          { error: `Insufficient permissions. Required: ${options.requireRole.join(' or ')}` },
          { status: 403 }
        ),
      };
    }

    // Get entity IDs for this org
    const { data: orgEntities } = await db
      .from('entities')
      .select('id')
      .eq('org_id', membership.org_id);

    const entityIds = (orgEntities || []).map((e: { id: string }) => e.id);

    return {
      user: { id: user.id, email: user.email },
      membership,
      db,
      entityIds,
    };
  } catch (err) {
    console.error('[getApiAuthContext] Unexpected error:', err);
    return {
      error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    };
  }
}
