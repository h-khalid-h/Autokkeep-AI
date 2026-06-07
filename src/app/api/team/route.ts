// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/team — Team Member Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { getTeamMembers, getTeamStats, inviteTeamMember } from '@/lib/team/manager';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'team-list' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const [membersResult, statsResult] = await Promise.all([
      getTeamMembers(db as Parameters<typeof getTeamMembers>[0], membership.org_id),
      getTeamStats(db as Parameters<typeof getTeamStats>[0], membership.org_id),
    ]);

    if (membersResult.error) {
      return NextResponse.json({ error: membersResult.error }, { status: 500 });
    }

    return NextResponse.json({
      members: membersResult.members,
      stats: statsResult.stats,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/team', 'Failed to fetch team members');
  }
}

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'team-invite' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const body = await request.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json(
        { error: 'Email and role are required' },
        { status: 400 }
      );
    }

    const result = await inviteTeamMember(
      db as Parameters<typeof inviteTeamMember>[0],
      membership.org_id,
      email,
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
      action: 'create',
      targetType: 'team_invite',
      targetId: result.invite?.id,
      details: { email, role },
      request,
    });

    return NextResponse.json({ invite: result.invite }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/team', 'Failed to invite team member');
  }
}
