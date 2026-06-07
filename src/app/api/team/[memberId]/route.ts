// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUT/DELETE /api/team/[memberId] — Update/Remove Team Member
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { updateMemberRole, removeMember } from '@/lib/team/manager';
import { writeAuditLog } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ memberId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'team-update' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const { memberId } = await params;
    const body = await request.json();
    const { role } = body;

    if (!role) {
      return NextResponse.json({ error: 'Role is required' }, { status: 400 });
    }

    const result = await updateMemberRole(
      db as Parameters<typeof updateMemberRole>[0],
      membership.org_id,
      memberId,
      role,
      user.id
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await writeAuditLog({
      supabase: db as Parameters<typeof writeAuditLog>[0]['supabase'],
      actorId: user.id,
      actorType: 'human',
      action: 'update',
      targetType: 'team_member',
      targetId: memberId,
      details: { newRole: role },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'PUT /api/team/[memberId]', 'Failed to update member role');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'team-remove' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const { memberId } = await params;

    const result = await removeMember(
      db as Parameters<typeof removeMember>[0],
      membership.org_id,
      memberId,
      user.id
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await writeAuditLog({
      supabase: db as Parameters<typeof writeAuditLog>[0]['supabase'],
      actorId: user.id,
      actorType: 'human',
      action: 'delete',
      targetType: 'team_member',
      targetId: memberId,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/team/[memberId]', 'Failed to remove team member');
  }
}
