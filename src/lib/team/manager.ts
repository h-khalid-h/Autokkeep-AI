// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Team Management Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createLogger } from '@/lib/logger';

const log = createLogger('team-manager');

// ── Types ────────────────────────────────────────────────────────────────────

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';
export type MemberStatus = 'active' | 'invited' | 'suspended';

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: TeamRole;
  status: MemberStatus;
  invitedBy: string | null;
  joinedAt: string | null;
  lastActiveAt: string | null;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  token: string;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
}

export interface TeamStats {
  total: number;
  owners: number;
  admins: number;
  members: number;
  viewers: number;
  active: number;
  invited: number;
  suspended: number;
}

interface DbClient {
  from: (table: string) => {
    select: (columns?: string, options?: { count?: 'exact'; head?: boolean }) => DbQueryChain;
    insert: (data: Record<string, unknown> | Record<string, unknown>[]) => DbQueryChain;
    update: (data: Record<string, unknown>) => DbQueryChain;
    delete: () => DbQueryChain;
  };
}

interface DbQueryChain {
  eq: (col: string, val: unknown) => DbQueryChain;
  neq: (col: string, val: unknown) => DbQueryChain;
  in: (col: string, vals: unknown[]) => DbQueryChain;
  is: (col: string, val: unknown) => DbQueryChain;
  order: (col: string, options?: { ascending?: boolean }) => DbQueryChain;
  limit: (n: number) => DbQueryChain;
  single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  select: (columns?: string, options?: { count?: 'exact'; head?: boolean }) => DbQueryChain;
  then: (fn: (result: { data: unknown[]; error: unknown; count?: number }) => void) => Promise<void>;
  data?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

// ── Role Hierarchy ───────────────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  owner: 40,
  admin: 30,
  member: 20,
  viewer: 10,
};

export function hasPermission(actorRole: TeamRole, requiredRole: TeamRole): boolean {
  return ROLE_HIERARCHY[actorRole] >= ROLE_HIERARCHY[requiredRole];
}

// ── Get Team Members ─────────────────────────────────────────────────────────

export async function getTeamMembers(
  db: DbClient,
  orgId: string
): Promise<{ members: TeamMember[]; error: string | null }> {
  try {
    const { data, error } = await db
      .from('team_members')
      .select('id, user_id, email, display_name, role, status, invited_by, joined_at, last_active_at')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('role', { ascending: true }) as unknown as { data: Record<string, unknown>[] | null; error: unknown };

    if (error) {
      log.error('Failed to fetch team members', { orgId, error });
      return { members: [], error: 'Failed to fetch team members' };
    }

    const members: TeamMember[] = (data || []).map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      email: row.email as string,
      displayName: (row.display_name as string) || null,
      role: row.role as TeamRole,
      status: row.status as MemberStatus,
      invitedBy: (row.invited_by as string) || null,
      joinedAt: (row.joined_at as string) || null,
      lastActiveAt: (row.last_active_at as string) || null,
    }));

    return { members, error: null };
  } catch (err) {
    log.error('Unexpected error fetching team members', { orgId, err });
    return { members: [], error: 'Unexpected error' };
  }
}

// ── Get Single Team Member ───────────────────────────────────────────────────

export async function getTeamMember(
  db: DbClient,
  orgId: string,
  userId: string
): Promise<{ member: TeamMember | null; error: string | null }> {
  try {
    const { data, error } = await db
      .from('team_members')
      .select('id, user_id, email, display_name, role, status, invited_by, joined_at, last_active_at')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .limit(1) as unknown as { data: Record<string, unknown>[] | null; error: unknown };

    if (error || !data || data.length === 0) {
      return { member: null, error: error ? 'Failed to fetch member' : null };
    }

    const row = data[0];
    return {
      member: {
        id: row.id as string,
        userId: row.user_id as string,
        email: row.email as string,
        displayName: (row.display_name as string) || null,
        role: row.role as TeamRole,
        status: row.status as MemberStatus,
        invitedBy: (row.invited_by as string) || null,
        joinedAt: (row.joined_at as string) || null,
        lastActiveAt: (row.last_active_at as string) || null,
      },
      error: null,
    };
  } catch (err) {
    log.error('Unexpected error fetching team member', { orgId, userId, err });
    return { member: null, error: 'Unexpected error' };
  }
}

// ── Invite Team Member ───────────────────────────────────────────────────────

export async function inviteTeamMember(
  db: DbClient,
  orgId: string,
  email: string,
  role: 'admin' | 'member' | 'viewer',
  invitedBy: string
): Promise<{ invite: TeamInvite | null; error: string | null }> {
  try {
    if (!email || !email.includes('@')) {
      return { invite: null, error: 'Invalid email address' };
    }

    if (!['admin', 'member', 'viewer'].includes(role)) {
      return { invite: null, error: 'Invalid role. Must be admin, member, or viewer' };
    }

    // Check if user is already a member
    const { data: existing } = await db
      .from('team_members')
      .select('id, status')
      .eq('org_id', orgId)
      .eq('email', email)
      .is('deleted_at', null)
      .limit(1) as unknown as { data: Record<string, unknown>[] | null };

    if (existing && existing.length > 0) {
      const status = existing[0].status as string;
      if (status === 'active') {
        return { invite: null, error: 'User is already a team member' };
      }
    }

    // Generate invite token
    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const inviteData = {
      org_id: orgId,
      email: email.toLowerCase().trim(),
      role,
      token,
      expires_at: expiresAt,
      created_by: invitedBy,
    };

    const { data, error } = await db
      .from('team_invites')
      .insert(inviteData)
      .select('id, email, role, token, expires_at, created_by, created_at') as unknown as { data: Record<string, unknown>[] | null; error: unknown };

    if (error) {
      log.error('Failed to create invite', { orgId, email, error });
      return { invite: null, error: 'Failed to create invite' };
    }

    const row = data?.[0];
    if (!row) {
      return { invite: null, error: 'Failed to create invite' };
    }

    log.info('Team invite created', { orgId, email, role, invitedBy });

    return {
      invite: {
        id: row.id as string,
        email: row.email as string,
        role: row.role as 'admin' | 'member' | 'viewer',
        token: row.token as string,
        expiresAt: row.expires_at as string,
        createdBy: row.created_by as string,
        createdAt: row.created_at as string,
      },
      error: null,
    };
  } catch (err) {
    log.error('Unexpected error creating invite', { orgId, email, err });
    return { invite: null, error: 'Unexpected error' };
  }
}

// ── Update Member Role ───────────────────────────────────────────────────────

export async function updateMemberRole(
  db: DbClient,
  orgId: string,
  targetUserId: string,
  newRole: TeamRole,
  updatedBy: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Fetch the target member
    const { member: target } = await getTeamMember(db, orgId, targetUserId);
    if (!target) {
      return { success: false, error: 'Member not found' };
    }

    // Protect owner role
    if (target.role === 'owner') {
      return { success: false, error: 'Cannot change the role of an owner' };
    }

    // Cannot promote to owner
    if (newRole === 'owner') {
      return { success: false, error: 'Cannot promote a member to owner' };
    }

    // Cannot change own role
    if (targetUserId === updatedBy) {
      return { success: false, error: 'Cannot change your own role' };
    }

    const { error } = await db
      .from('team_members')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)
      .is('deleted_at', null) as unknown as { error: unknown };

    if (error) {
      log.error('Failed to update member role', { orgId, targetUserId, newRole, error });
      return { success: false, error: 'Failed to update role' };
    }

    log.info('Member role updated', { orgId, targetUserId, newRole, updatedBy });
    return { success: true, error: null };
  } catch (err) {
    log.error('Unexpected error updating role', { orgId, targetUserId, err });
    return { success: false, error: 'Unexpected error' };
  }
}

// ── Remove Member ────────────────────────────────────────────────────────────

export async function removeMember(
  db: DbClient,
  orgId: string,
  targetUserId: string,
  removedBy: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Fetch the target member
    const { member: target } = await getTeamMember(db, orgId, targetUserId);
    if (!target) {
      return { success: false, error: 'Member not found' };
    }

    // Cannot remove owner
    if (target.role === 'owner') {
      return { success: false, error: 'Cannot remove the owner' };
    }

    // Cannot remove self
    if (targetUserId === removedBy) {
      return { success: false, error: 'Cannot remove yourself' };
    }

    // Soft-delete: set deleted_at
    const { error } = await db
      .from('team_members')
      .update({ deleted_at: new Date().toISOString(), status: 'suspended' })
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)
      .is('deleted_at', null) as unknown as { error: unknown };

    if (error) {
      log.error('Failed to remove member', { orgId, targetUserId, error });
      return { success: false, error: 'Failed to remove member' };
    }

    log.info('Member removed', { orgId, targetUserId, removedBy });
    return { success: true, error: null };
  } catch (err) {
    log.error('Unexpected error removing member', { orgId, targetUserId, err });
    return { success: false, error: 'Unexpected error' };
  }
}

// ── Get Team Stats ───────────────────────────────────────────────────────────

export async function getTeamStats(
  db: DbClient,
  orgId: string
): Promise<{ stats: TeamStats; error: string | null }> {
  try {
    const { members, error } = await getTeamMembers(db, orgId);
    if (error) {
      return {
        stats: { total: 0, owners: 0, admins: 0, members: 0, viewers: 0, active: 0, invited: 0, suspended: 0 },
        error,
      };
    }

    const stats: TeamStats = {
      total: members.length,
      owners: members.filter((m) => m.role === 'owner').length,
      admins: members.filter((m) => m.role === 'admin').length,
      members: members.filter((m) => m.role === 'member').length,
      viewers: members.filter((m) => m.role === 'viewer').length,
      active: members.filter((m) => m.status === 'active').length,
      invited: members.filter((m) => m.status === 'invited').length,
      suspended: members.filter((m) => m.status === 'suspended').length,
    };

    return { stats, error: null };
  } catch (err) {
    log.error('Unexpected error fetching team stats', { orgId, err });
    return {
      stats: { total: 0, owners: 0, admins: 0, members: 0, viewers: 0, active: 0, invited: 0, suspended: 0 },
      error: 'Unexpected error',
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateInviteToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'inv_';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
