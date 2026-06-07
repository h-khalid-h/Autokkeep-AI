import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

import {
  getTeamMembers,
  getTeamMember,
  inviteTeamMember,
  updateMemberRole,
  removeMember,
  getTeamStats,
  hasPermission,
} from './manager';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createMockDb(overrides?: {
  selectData?: Record<string, unknown>[] | null;
  selectError?: unknown;
  insertData?: Record<string, unknown>[] | null;
  insertError?: unknown;
  updateError?: unknown;
}) {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.neq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue({
      ...chain,
      data: overrides?.selectData ?? [],
      error: overrides?.selectError ?? null,
    });
    chain.data = overrides?.selectData ?? [];
    chain.error = overrides?.selectError ?? null;
    return chain;
  };

  const insertChain = {
    select: vi.fn().mockReturnValue({
      data: overrides?.insertData ?? [{
        id: 'inv-1',
        email: 'test@example.com',
        role: 'member',
        token: 'inv_test123',
        expires_at: '2026-06-14T00:00:00Z',
        created_by: 'user-1',
        created_at: '2026-06-07T00:00:00Z',
      }],
      error: overrides?.insertError ?? null,
    }),
  };

  const updateChain: Record<string, unknown> = {};
  updateChain.eq = vi.fn().mockReturnValue(updateChain);
  updateChain.is = vi.fn().mockReturnValue({
    error: overrides?.updateError ?? null,
  });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(makeSelectChain()),
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
      delete: vi.fn().mockReturnValue(updateChain),
    }),
  };
}

const MOCK_MEMBERS = [
  { id: 'm-1', user_id: 'u-1', email: 'owner@test.com', display_name: 'Owner', role: 'owner', status: 'active', invited_by: null, joined_at: '2026-01-01T00:00:00Z', last_active_at: '2026-06-07T00:00:00Z' },
  { id: 'm-2', user_id: 'u-2', email: 'admin@test.com', display_name: 'Admin', role: 'admin', status: 'active', invited_by: 'u-1', joined_at: '2026-02-01T00:00:00Z', last_active_at: '2026-06-06T00:00:00Z' },
  { id: 'm-3', user_id: 'u-3', email: 'member@test.com', display_name: null, role: 'member', status: 'active', invited_by: 'u-1', joined_at: '2026-03-01T00:00:00Z', last_active_at: null },
  { id: 'm-4', user_id: 'u-4', email: 'viewer@test.com', display_name: 'Viewer', role: 'viewer', status: 'invited', invited_by: 'u-2', joined_at: null, last_active_at: null },
];

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Team Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasPermission', () => {
    it('should return true when actor role is higher or equal', () => {
      expect(hasPermission('owner', 'admin')).toBe(true);
      expect(hasPermission('admin', 'admin')).toBe(true);
      expect(hasPermission('admin', 'member')).toBe(true);
    });

    it('should return false when actor role is lower', () => {
      expect(hasPermission('viewer', 'admin')).toBe(false);
      expect(hasPermission('member', 'admin')).toBe(false);
    });
  });

  describe('getTeamMembers', () => {
    it('should return team members for an org', async () => {
      const db = createMockDb({ selectData: MOCK_MEMBERS });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getTeamMembers(db as any, 'org-1');

      expect(result.error).toBeNull();
      expect(result.members).toHaveLength(4);
      expect(result.members[0].email).toBe('owner@test.com');
      expect(result.members[0].role).toBe('owner');
    });

    it('should return empty array on DB error', async () => {
      const db = createMockDb({ selectData: null, selectError: { message: 'Connection failed' } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getTeamMembers(db as any, 'org-1');

      expect(result.error).toBe('Failed to fetch team members');
      expect(result.members).toHaveLength(0);
    });
  });

  describe('getTeamMember', () => {
    it('should return a single member', async () => {
      const db = createMockDb({ selectData: [MOCK_MEMBERS[0]] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getTeamMember(db as any, 'org-1', 'u-1');

      expect(result.error).toBeNull();
      expect(result.member).not.toBeNull();
      expect(result.member?.userId).toBe('u-1');
    });

    it('should return null when member not found', async () => {
      const db = createMockDb({ selectData: [] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getTeamMember(db as any, 'org-1', 'u-999');

      expect(result.member).toBeNull();
    });
  });

  describe('inviteTeamMember', () => {
    it('should create an invite with valid data', async () => {
      const db = createMockDb({ selectData: [] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await inviteTeamMember(db as any, 'org-1', 'new@test.com', 'member', 'u-1');

      expect(result.error).toBeNull();
      expect(result.invite).not.toBeNull();
      expect(result.invite?.email).toBe('test@example.com');
      expect(result.invite?.role).toBe('member');
    });

    it('should reject invalid email', async () => {
      const db = createMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await inviteTeamMember(db as any, 'org-1', 'not-an-email', 'member', 'u-1');

      expect(result.error).toBe('Invalid email address');
      expect(result.invite).toBeNull();
    });

    it('should reject empty email', async () => {
      const db = createMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await inviteTeamMember(db as any, 'org-1', '', 'member', 'u-1');

      expect(result.error).toBe('Invalid email address');
    });

    it('should reject invalid role', async () => {
      const db = createMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await inviteTeamMember(db as any, 'org-1', 'test@test.com', 'superadmin' as 'admin', 'u-1');

      expect(result.error).toBe('Invalid role. Must be admin, member, or viewer');
    });

    it('should reject if user is already an active member', async () => {
      const db = createMockDb({ selectData: [{ id: 'm-1', status: 'active' }] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await inviteTeamMember(db as any, 'org-1', 'existing@test.com', 'member', 'u-1');

      expect(result.error).toBe('User is already a team member');
    });
  });

  describe('updateMemberRole', () => {
    it('should prevent changing owner role', async () => {
      const db = createMockDb({ selectData: [MOCK_MEMBERS[0]] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await updateMemberRole(db as any, 'org-1', 'u-1', 'admin', 'u-2');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot change the role of an owner');
    });

    it('should prevent promotion to owner', async () => {
      const db = createMockDb({ selectData: [MOCK_MEMBERS[1]] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await updateMemberRole(db as any, 'org-1', 'u-2', 'owner', 'u-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot promote a member to owner');
    });

    it('should prevent changing own role', async () => {
      const db = createMockDb({ selectData: [MOCK_MEMBERS[1]] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await updateMemberRole(db as any, 'org-1', 'u-2', 'member', 'u-2');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot change your own role');
    });

    it('should return error when member not found', async () => {
      const db = createMockDb({ selectData: [] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await updateMemberRole(db as any, 'org-1', 'u-999', 'admin', 'u-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Member not found');
    });
  });

  describe('removeMember', () => {
    it('should prevent removing owner', async () => {
      const db = createMockDb({ selectData: [MOCK_MEMBERS[0]] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await removeMember(db as any, 'org-1', 'u-1', 'u-2');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot remove the owner');
    });

    it('should prevent self-removal', async () => {
      const db = createMockDb({ selectData: [MOCK_MEMBERS[1]] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await removeMember(db as any, 'org-1', 'u-2', 'u-2');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot remove yourself');
    });

    it('should return error when member not found', async () => {
      const db = createMockDb({ selectData: [] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await removeMember(db as any, 'org-1', 'u-999', 'u-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Member not found');
    });
  });

  describe('getTeamStats', () => {
    it('should return correct counts by role and status', async () => {
      const db = createMockDb({ selectData: MOCK_MEMBERS });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getTeamStats(db as any, 'org-1');

      expect(result.error).toBeNull();
      expect(result.stats.total).toBe(4);
      expect(result.stats.owners).toBe(1);
      expect(result.stats.admins).toBe(1);
      expect(result.stats.members).toBe(1);
      expect(result.stats.viewers).toBe(1);
      expect(result.stats.active).toBe(3);
      expect(result.stats.invited).toBe(1);
    });

    it('should return zero stats on DB error', async () => {
      const db = createMockDb({ selectData: null, selectError: { message: 'DB error' } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getTeamStats(db as any, 'org-1');

      expect(result.stats.total).toBe(0);
      expect(result.error).not.toBeNull();
    });
  });
});
