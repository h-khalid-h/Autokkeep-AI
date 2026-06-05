
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST/PUT/DELETE /api/vendor-managers — Vendor Manager CRUD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { parseBody, schemas } from '@/lib/validation';

// ─── GET: List vendor managers for user's entities ──────────────────────────

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'vm-read' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { db, entityIds: allEntityIds } = ctx;

    if (allEntityIds.length === 0) {
      return NextResponse.json({ vendorManagers: [] });
    }

    // If entityId provided, validate it belongs to this org; otherwise use all
    const requestedEntityId = new URL(request.url).searchParams.get('entityId');
    const entityIds = requestedEntityId && allEntityIds.includes(requestedEntityId)
      ? [requestedEntityId]
      : allEntityIds;

    const { data: vendorManagers, error: queryError } = await db
      .from('vendor_managers')
      .select('id, entity_id, vendor_pattern, manager_user_id, created_at')
      .in('entity_id', entityIds)
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error('[VendorManagers] Query error:', queryError);
      return NextResponse.json(
        { error: 'Failed to fetch vendor managers' },
        { status: 500 }
      );
    }

    return NextResponse.json({ vendorManagers: vendorManagers || [] });
  } catch (error) {
    return handleApiError(error, 'vendor-managers-get', 'Failed to fetch vendor managers');
  }
}

// ─── POST: Create new vendor manager ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'vm-create' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    const parsed = await parseBody(request, schemas.createVendorManager);
    if (!parsed.success) return parsed.error;
    const { entityId, vendorPattern, managerUserId } = parsed.data;

    // Validate entity access
    if (!entityIds.includes(entityId)) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Validate the manager_user_id is a valid team member in this org
    const { data: memberCheck } = await db
      .from('team_members')
      .select('user_id')
      .eq('user_id', managerUserId)
      .eq('org_id', ctx.membership.org_id)
      .limit(1);

    if (!memberCheck || memberCheck.length === 0) {
      return NextResponse.json(
        { error: 'Manager user is not a member of this organization' },
        { status: 400 }
      );
    }

    // Insert new vendor manager
    const { data: vendorManager, error: insertError } = await db
      .from('vendor_managers')
      .insert({
        entity_id: entityId,
        vendor_pattern: vendorPattern,
        manager_user_id: managerUserId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[VendorManagers] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create vendor manager' },
        { status: 500 }
      );
    }

    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'create',
      targetType: 'vendor_manager',
      targetId: vendorManager.id,
      details: { vendorPattern, managerUserId },
      request,
    });

    return NextResponse.json({ vendorManager }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'vendor-managers-post', 'Failed to create vendor manager');
  }
}

// ─── PUT: Update existing vendor manager ────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'vm-update' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    const parsed = await parseBody(request, schemas.updateVendorManager);
    if (!parsed.success) return parsed.error;
    const { id, vendorPattern, managerUserId } = parsed.data;

    // Verify the vendor manager belongs to an entity in this org
    const { data: existing } = await db
      .from('vendor_managers')
      .select('id, entity_id')
      .eq('id', id)
      .in('entity_id', entityIds)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Vendor manager not found or access denied' },
        { status: 404 }
      );
    }

    // Validate manager_user_id if being updated
    if (managerUserId) {
      const { data: memberCheck } = await db
        .from('team_members')
        .select('user_id')
        .eq('user_id', managerUserId)
        .eq('org_id', ctx.membership.org_id)
        .limit(1);

      if (!memberCheck || memberCheck.length === 0) {
        return NextResponse.json(
          { error: 'Manager user is not a member of this organization' },
          { status: 400 }
        );
      }
    }

    // Build update payload
    const updates: Record<string, unknown> = {};
    if (vendorPattern !== undefined) updates.vendor_pattern = vendorPattern;
    if (managerUserId !== undefined) updates.manager_user_id = managerUserId;



    const { data: vendorManager, error: updateError } = await db
      .from('vendor_managers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[VendorManagers] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update vendor manager' },
        { status: 500 }
      );
    }

    await writeAuditLog({
      supabase: db,
      entityId: existing.entity_id,
      actorId: user.id,
      actorType: 'human',
      action: 'update',
      targetType: 'vendor_manager',
      targetId: id,
      details: updates,
      request,
    });

    return NextResponse.json({ vendorManager });
  } catch (error) {
    return handleApiError(error, 'vendor-managers-put', 'Failed to update vendor manager');
  }
}

// ─── DELETE: Remove a vendor manager ────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'vm-delete' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Vendor manager id is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: existing } = await db
      .from('vendor_managers')
      .select('id, entity_id')
      .eq('id', id)
      .in('entity_id', entityIds)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Vendor manager not found or access denied' },
        { status: 404 }
      );
    }

    const { error: deleteError } = await db
      .from('vendor_managers')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[VendorManagers] Delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete vendor manager' },
        { status: 500 }
      );
    }

    await writeAuditLog({
      supabase: db,
      entityId: existing.entity_id,
      actorId: user.id,
      actorType: 'human',
      action: 'delete',
      targetType: 'vendor_manager',
      targetId: id,
      details: {},
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'vendor-managers-delete', 'Failed to delete vendor manager');
  }
}
