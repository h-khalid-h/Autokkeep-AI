import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';
import { getApiAuthContext } from '@/lib/api-auth';
import { writeAuditLog } from '@/lib/audit';

/**
 * DELETE /api/team/members
 *
 * Removes a team member from the organization.
 * Requires owner or admin role.
 *
 * Body: { userId: string }
 * Returns: { success: true } or error
 */
export async function DELETE(request: NextRequest) {
  try {
    // Auth check — only org admins/owners can remove members
    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    // Parse request body
    const body = await request.json();
    const { userId: targetUserId } = body as { userId?: string };

    if (!targetUserId || typeof targetUserId !== 'string') {
      return NextResponse.json(
        { error: 'userId is required in request body' },
        { status: 400 }
      );
    }

    // Prevent removing self through this endpoint
    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: 'You cannot remove yourself. Please use the leave team option instead.' },
        { status: 400 }
      );
    }

    // Fetch the target member to validate they exist and check their role
    const { data: targetMember, error: fetchError } = await db
      .from('team_members')
      .select('id, user_id, role')
      .eq('user_id', targetUserId)
      .eq('org_id', membership.org_id)
      .maybeSingle();

    if (fetchError || !targetMember) {
      return NextResponse.json(
        { error: 'Member not found in this organization' },
        { status: 404 }
      );
    }

    // Cannot remove the org owner
    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove the organization owner' },
        { status: 403 }
      );
    }

    // Delete the team member record
    const { error: deleteError } = await db
      .from('team_members')
      .delete()
      .eq('user_id', targetUserId)
      .eq('org_id', membership.org_id);

    if (deleteError) {
      console.error('[Team Members] Delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to remove team member' },
        { status: 500 }
      );
    }

    // Cancel any pending approval_requests where the removed user is the approver
    const { error: cancelError } = await db
      .from('approval_requests')
      .update({ status: 'cancelled' })
      .eq('approver_user_id', targetUserId)
      .eq('status', 'pending');

    if (cancelError) {
      // Non-fatal: the member was already removed
      console.error('[Team Members] Failed to cancel approval requests:', cancelError);
    }

    // Write audit log (fire-and-forget)
    writeAuditLog({
      supabase: db,
      actorId: user.id,
      actorType: 'human',
      action: 'delete',
      targetType: 'team_member',
      targetId: targetUserId,
      details: {
        org_id: membership.org_id,
        removed_role: targetMember.role,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, 'team-members', 'Failed to remove team member');
  }
}
