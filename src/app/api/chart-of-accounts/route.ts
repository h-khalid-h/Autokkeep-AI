
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/chart-of-accounts — List & Create GL Accounts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

// ─── GET: List all chart of accounts for user's entity ──────────────────────────

export async function GET(request: NextRequest) {
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

    const allEntityIds = (orgEntities || []).map((e: { id: string }) => e.id);
    if (allEntityIds.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // If entityId provided, validate it belongs to this org; otherwise use all
    const requestedEntityId = new URL(request.url).searchParams.get('entityId');
    const entityIds = requestedEntityId && allEntityIds.includes(requestedEntityId)
      ? [requestedEntityId]
      : allEntityIds;

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
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'coa' });
    if (limited) return limited;

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
    await writeAuditLog({
      supabase,
      entityId: resolvedEntityId!,
      actorId: user.id,
      actorType: 'human',
      action: 'create',
      targetType: 'chart_of_accounts',
      targetId: account.id,
      details: { code, name, type, description },
      request,
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

// ─── PUT: Update an existing GL account ─────────────────────────────────────────

interface UpdateAccountBody {
  id: string;
  code?: string;
  name?: string;
  type?: string;
  is_active?: boolean;
  entityId?: string;
}

export async function PUT(request: NextRequest) {
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

    const body: UpdateAccountBody = await request.json();
    const { id, code, name, type, is_active, entityId } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Account id is required' },
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

    // Get all entities for this org to validate account ownership
    const { data: orgEntities } = await (supabase as any)
      .from('entities')
      .select('id')
      .eq('org_id', membership.org_id);

    const entityIds = (orgEntities || []).map((e: { id: string }) => e.id);

    // Verify the account belongs to an entity in this org
    const { data: existing } = await (supabase as any)
      .from('chart_of_accounts')
      .select('id, entity_id')
      .eq('id', id)
      .in('entity_id', entityIds)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 404 }
      );
    }

    // Build update payload
    const updates: Record<string, any> = {};
    if (code !== undefined) updates.code = code;
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type.toLowerCase();
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Check for duplicate code if code is being changed
    if (code !== undefined) {
      const { data: duplicate } = await (supabase as any)
        .from('chart_of_accounts')
        .select('id')
        .eq('entity_id', existing.entity_id)
        .eq('code', code)
        .neq('id', id)
        .single();

      if (duplicate) {
        return NextResponse.json(
          { error: `Account code "${code}" already exists` },
          { status: 409 }
        );
      }
    }

    const { data: account, error: updateError } = await (supabase as any)
      .from('chart_of_accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[ChartOfAccounts] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update account' },
        { status: 500 }
      );
    }

    // Log to audit
    await writeAuditLog({
      supabase,
      entityId: existing.entity_id,
      actorId: user.id,
      actorType: 'human',
      action: 'update',
      targetType: 'chart_of_accounts',
      targetId: id,
      details: updates,
      request,
    });

    return NextResponse.json({ account });
  } catch (error) {
    console.error('[ChartOfAccounts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update account' },
      { status: 500 }
    );
  }
}

// ─── DELETE: Remove a GL account ────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Account id is required' },
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

    // Get all entities for this org
    const { data: orgEntities } = await (supabase as any)
      .from('entities')
      .select('id')
      .eq('org_id', membership.org_id);

    const entityIds = (orgEntities || []).map((e: { id: string }) => e.id);

    // Verify the account belongs to an entity in this org
    const { data: existing } = await (supabase as any)
      .from('chart_of_accounts')
      .select('id, entity_id')
      .eq('id', id)
      .in('entity_id', entityIds)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 404 }
      );
    }

    // Check for transactions referencing this GL account code
    const { data: accountData } = await (supabase as any)
      .from('chart_of_accounts')
      .select('code')
      .eq('id', id)
      .single();

    if (accountData?.code) {
      // Sanitize code for PostgREST filter syntax (prevent injection via dots/commas)
      const safeCode = accountData.code.replace(/[^a-zA-Z0-9_-]/g, '');
      const { count: refCount } = await (supabase as any)
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', existing.entity_id)
        .or(`category_ai.eq.${safeCode},category_human.eq.${safeCode}`);

      if (refCount && refCount > 0) {
        // Soft-delete: deactivate instead of hard delete to preserve references
        const { error: deactivateError } = await (supabase as any)
          .from('chart_of_accounts')
          .update({ is_active: false })
          .eq('id', id);

        if (deactivateError) {
          return NextResponse.json(
            { error: 'Failed to deactivate account' },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          soft_deleted: true,
          message: `Account deactivated (referenced by ${refCount} transactions)`,
        });
      }
    }

    const { error: deleteError } = await (supabase as any)
      .from('chart_of_accounts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[ChartOfAccounts] Delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete account' },
        { status: 500 }
      );
    }

    // Log to audit
    await writeAuditLog({
      supabase,
      entityId: existing.entity_id,
      actorId: user.id,
      actorType: 'human',
      action: 'delete',
      targetType: 'chart_of_accounts',
      targetId: id,
      details: {},
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ChartOfAccounts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}


