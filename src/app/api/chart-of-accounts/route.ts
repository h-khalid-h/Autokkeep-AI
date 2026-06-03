
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/chart-of-accounts — List & Create GL Accounts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import { parseBody, schemas } from '@/lib/validation';

// ─── GET: List all chart of accounts for user's entity ──────────────────────────

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'coa-read' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { db, entityIds: allEntityIds } = ctx;

    if (allEntityIds.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // If entityId provided, validate it belongs to this org; otherwise use all
    const requestedEntityId = new URL(request.url).searchParams.get('entityId');
    const entityIds = requestedEntityId && allEntityIds.includes(requestedEntityId)
      ? [requestedEntityId]
      : allEntityIds;

    // Fetch chart of accounts
    const { data: accounts, error: queryError } = await db
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
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to fetch chart of accounts' },
      { status: 500 }
    );
  }
}

// ─── POST: Create new GL account ────────────────────────────────────────────────



export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'coa' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const parsed = await parseBody(request, schemas.createAccount);
    if (!parsed.success) return parsed.error;
    const { code, name, type, description, active, entityId, is_active } = parsed.data;

    // Resolve entity_id: use provided entityId or default to first entity
    let resolvedEntityId = entityId;
    if (!resolvedEntityId) {
      const { data: entities } = await db
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
      const { data: entity } = await db
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
    const { data: existing } = await db
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
    const { data: account, error: insertError } = await db
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
      supabase: db,
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
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}

// ─── PUT: Update an existing GL account ─────────────────────────────────────────



export async function PUT(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'coa-update' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    const parsed = await parseBody(request, schemas.updateAccount);
    if (!parsed.success) return parsed.error;
    const { id, code, name, type, is_active, entityId: _entityId } = parsed.data;

    // Verify the account belongs to an entity in this org
    const { data: existing } = await db
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
    const updates: Record<string, unknown> = {};
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
      const { data: duplicate } = await db
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

    const { data: account, error: updateError } = await db
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
      supabase: db,
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
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to update account' },
      { status: 500 }
    );
  }
}

// ─── DELETE: Remove a GL account ────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'coa-delete' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Account id is required' },
        { status: 400 }
      );
    }

    // Verify the account belongs to an entity in this org
    const { data: existing } = await db
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
    const { data: accountData } = await db
      .from('chart_of_accounts')
      .select('code')
      .eq('id', id)
      .single();

    if (accountData?.code) {
      // Sanitize code for PostgREST filter syntax (prevent injection via dots/commas)
      const safeCode = accountData.code.replace(/[^a-zA-Z0-9_-]/g, '');
      const { count: refCount } = await db
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', existing.entity_id)
        .or(`category_ai.eq.${safeCode},category_human.eq.${safeCode}`);

      if (refCount && refCount > 0) {
        // Soft-delete: deactivate instead of hard delete to preserve references
        const { error: deactivateError } = await db
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

    const { error: deleteError } = await db
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
      supabase: db,
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
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}


