
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/chart-of-accounts — List & Create GL Accounts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// ─── GET: List all chart of accounts for user's entity ──────────────────────────

export async function GET() {
  try {
    const supabase = await createServerClient();

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate org membership
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get all entities for this org
    const { data: orgEntities } = await (supabase as any)
      .from('entities')
      .select('id')
      .eq('org_id', membership.org_id);

    const entityIds = (orgEntities || []).map((e: { id: string }) => e.id);
    if (entityIds.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Fetch chart of accounts
    const { data: accounts, error: queryError } = await (supabase as any)
      .from('chart_of_accounts')
      .select('id, entity_id, code, name, type, is_active, created_at')
      .in('entity_id', entityIds)
      .order('code', { ascending: true });

    if (queryError) {
      console.error('[ChartOfAccounts] Query error:', queryError);
      return NextResponse.json(
        { error: 'Failed to fetch chart of accounts' },
        { status: 500 }
      );
    }

    return NextResponse.json({ accounts: accounts || [] });
  } catch (error) {
    console.error('[ChartOfAccounts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart of accounts' },
      { status: 500 }
    );
  }
}

// ─── POST: Create new GL account ────────────────────────────────────────────────

interface CreateAccountBody {
  code: string;
  name: string;
  type: string;
  description?: string;
  active?: boolean;
  entityId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateAccountBody = await request.json();
    const { code, name, type, description, active, entityId } = body;

    if (!code || !name || !type) {
      return NextResponse.json(
        { error: 'code, name, and type are required' },
        { status: 400 }
      );
    }

    // Validate org membership
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Resolve entity_id: use provided entityId or default to first entity
    let resolvedEntityId = entityId;
    if (!resolvedEntityId) {
      const { data: entities } = await (supabase as any)
        .from('entities')
        .select('id')
        .eq('org_id', membership.org_id)
        .order('created_at', { ascending: true })
        .limit(1);

      if (!entities || entities.length === 0) {
        return NextResponse.json(
          { error: 'No entity found for this organization' },
          { status: 400 }
        );
      }
      resolvedEntityId = entities[0].id;
    } else {
      // Validate entity access
      const { data: entity } = await (supabase as any)
        .from('entities')
        .select('id, org_id')
        .eq('id', resolvedEntityId)
        .eq('org_id', membership.org_id)
        .single();

      if (!entity) {
        return NextResponse.json(
          { error: 'Entity not found or access denied' },
          { status: 403 }
        );
      }
    }

    // Check for duplicate code
    const { data: existing } = await (supabase as any)
      .from('chart_of_accounts')
      .select('id')
      .eq('entity_id', resolvedEntityId)
      .eq('code', code)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: `Account code "${code}" already exists` },
        { status: 409 }
      );
    }

    // Insert new account
    const { data: account, error: insertError } = await (supabase as any)
      .from('chart_of_accounts')
      .insert({
        entity_id: resolvedEntityId,
        code,
        name,
        type: type.toLowerCase(),
        is_active: active !== false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[ChartOfAccounts] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create account' },
        { status: 500 }
      );
    }

    // Log to audit
    await (supabase as any).from('audit_log').insert({
      entity_id: resolvedEntityId,
      actor_id: user.id,
      actor_type: 'human',
      action: 'create',
      target_type: 'chart_of_accounts',
      target_id: account.id,
      details: { code, name, type, description },
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error('[ChartOfAccounts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}
