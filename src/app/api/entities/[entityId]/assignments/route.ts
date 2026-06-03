// CRUD /api/entities/[entityId]/assignments — Per-entity user assignments
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ entityId: string }> };

/**
 * GET /api/entities/[entityId]/assignments
 * List all user assignments for a given entity. Owner/admin only.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'entity-assign-list' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { db, entityIds } = ctx;

    const { entityId } = await context.params;
    if (!UUID_RE.test(entityId)) {
      return NextResponse.json({ error: 'Invalid entity ID format' }, { status: 400 });
    }

    // Validate entity belongs to user's org
    if (!entityIds.includes(entityId)) {
      return NextResponse.json({ error: 'Entity not found in your organization' }, { status: 404 });
    }

    const { data, error } = await db
      .from('entity_assignments')
      .select('id, entity_id, user_id, assigned_by, created_at')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Entity Assignments GET] Query error:', error);
      return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error('[Entity Assignments GET] Unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/entities/[entityId]/assignments
 * Add a user assignment. Owner/admin only.
 * Body: { userId: string }
 *
 * If the assigned user has role owner/admin, they are auto-assigned to
 * ALL entities in the org (not just the requested one).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'entity-assign-add' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { user, db, membership, entityIds } = ctx;

    const { entityId } = await context.params;
    if (!UUID_RE.test(entityId)) {
      return NextResponse.json({ error: 'Invalid entity ID format' }, { status: 400 });
    }

    if (!entityIds.includes(entityId)) {
      return NextResponse.json({ error: 'Entity not found in your organization' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId || !UUID_RE.test(userId)) {
      return NextResponse.json({ error: 'Valid userId (UUID) is required' }, { status: 400 });
    }

    // Validate user is a member of the same org
    const { data: targetMember } = await db
      .from('team_members')
      .select('id, role')
      .eq('user_id', userId)
      .eq('org_id', membership.org_id)
      .limit(1);

    if (!targetMember || targetMember.length === 0) {
      return NextResponse.json({ error: 'User is not a member of this organization' }, { status: 404 });
    }

    const targetRole = targetMember[0].role;

    // If the target user is owner/admin, auto-assign them to ALL entities
    if (targetRole === 'owner' || targetRole === 'admin') {
      const rows = entityIds.map((eid: string) => ({
        entity_id: eid,
        user_id: userId,
        assigned_by: user.id,
      }));

      const { error: bulkError } = await db
        .from('entity_assignments')
        .upsert(rows, { onConflict: 'entity_id,user_id', ignoreDuplicates: true });

      if (bulkError) {
        console.error('[Entity Assignments POST] Bulk upsert error:', bulkError);
        return NextResponse.json({ error: 'Failed to auto-assign user to all entities' }, { status: 500 });
      }

      return NextResponse.json(
        { message: 'User auto-assigned to all entities (owner/admin role)', count: entityIds.length },
        { status: 201 }
      );
    }

    // Standard assignment: single entity
    const { data: assignment, error: insertError } = await db
      .from('entity_assignments')
      .upsert(
        { entity_id: entityId, user_id: userId, assigned_by: user.id },
        { onConflict: 'entity_id,user_id', ignoreDuplicates: true }
      )
      .select('id, entity_id, user_id, assigned_by, created_at')
      .single();

    if (insertError) {
      console.error('[Entity Assignments POST] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 });
    }

    return NextResponse.json(assignment, { status: 201 });
  } catch (err) {
    console.error('[Entity Assignments POST] Unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/entities/[entityId]/assignments
 * Remove a user assignment. Owner/admin only.
 * Body: { userId: string }
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'entity-assign-rm' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { db, entityIds } = ctx;

    const { entityId } = await context.params;
    if (!UUID_RE.test(entityId)) {
      return NextResponse.json({ error: 'Invalid entity ID format' }, { status: 400 });
    }

    if (!entityIds.includes(entityId)) {
      return NextResponse.json({ error: 'Entity not found in your organization' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId || !UUID_RE.test(userId)) {
      return NextResponse.json({ error: 'Valid userId (UUID) is required' }, { status: 400 });
    }

    const { error: deleteError, count } = await db
      .from('entity_assignments')
      .delete({ count: 'exact' })
      .eq('entity_id', entityId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[Entity Assignments DELETE] Error:', deleteError);
      return NextResponse.json({ error: 'Failed to remove assignment' }, { status: 500 });
    }

    if (count === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Assignment removed' });
  } catch (err) {
    console.error('[Entity Assignments DELETE] Unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
