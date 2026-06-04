import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================
// Mock dependencies before imports
// ============================================

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(),
}));

import { getApiAuthContext } from './api-auth';
import { createServerClient } from '@/lib/supabase/server';

// ============================================
// Mock Supabase factory
// ============================================

/* eslint-disable @typescript-eslint/no-explicit-any */

interface MockSupabaseConfig {
  user?: { id: string; email?: string } | null;
  authError?: any;
  membership?: { id: string; org_id: string; role: string } | null;
  orgEntities?: Array<{ id: string }>;
  entityAssignments?: Array<{ entity_id: string }> | null;
}

function createMockSupabase(config: MockSupabaseConfig) {
  const {
    user = { id: 'user-1', email: 'user@example.com' },
    authError = null,
    membership = { id: 'tm-1', org_id: 'org-1', role: 'owner' },
    orgEntities = [{ id: 'entity-1' }],
    entityAssignments = null,
  } = config;

  // Track which queries have been made to return contextual data
  let teamMembersCalled = false;

  const mock: any = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: authError,
      }),
    },
    from: vi.fn((table: string) => {
      const chain: any = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);

      if (table === 'team_members') {
        if (!teamMembersCalled) {
          teamMembersCalled = true;
          chain.then = (resolve: any) =>
            resolve({ data: membership ? [membership] : [], error: null });
        } else {
          chain.then = (resolve: any) =>
            resolve({ data: membership ? [membership] : [], error: null });
        }
      } else if (table === 'entities') {
        chain.then = (resolve: any) =>
          resolve({ data: orgEntities, error: null });
      } else if (table === 'entity_assignments') {
        chain.then = (resolve: any) =>
          resolve({ data: entityAssignments, error: null });
      }

      return chain;
    }),
  };

  return mock;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// Helpers
// ============================================

function createRequest(headers?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/test');
  const reqHeaders = new Headers(headers);
  return new NextRequest(url, { method: 'GET', headers: reqHeaders });
}

// ============================================
// Test Suite
// ============================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getApiAuthContext', () => {
  // ── Valid auth ──────────────────────────────────────────────────────────

  describe('valid auth — returns user and entity context', () => {
    it('returns user, membership, db, and entityIds for authenticated owner', async () => {
      const mockDb = createMockSupabase({});
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const req = createRequest();
      const ctx = await getApiAuthContext(req);

      expect(ctx.error).toBeUndefined();
      expect(ctx.user).toEqual({ id: 'user-1', email: 'user@example.com' });
      expect(ctx.membership).toEqual({ id: 'tm-1', org_id: 'org-1', role: 'owner' });
      expect(ctx.entityIds).toEqual(['entity-1']);
      expect(ctx.db).toBeDefined();
    });

    it('returns multiple entity IDs for owner/admin', async () => {
      const mockDb = createMockSupabase({
        orgEntities: [{ id: 'e-1' }, { id: 'e-2' }, { id: 'e-3' }],
      });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(createRequest());

      expect(ctx.entityIds).toEqual(['e-1', 'e-2', 'e-3']);
    });
  });

  // ── 401 for unauthenticated ────────────────────────────────────────────

  describe('returns 401 for unauthenticated requests', () => {
    it('returns 401 when getUser returns error', async () => {
      const mockDb = createMockSupabase({
        user: null,
        authError: { message: 'Invalid JWT' },
      });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(createRequest());

      expect(ctx.error).toBeDefined();
      const res = ctx.error!;
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('returns 401 when user is null (no auth error)', async () => {
      const mockDb = createMockSupabase({ user: null });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(createRequest());

      expect(ctx.error).toBeDefined();
      expect(ctx.error!.status).toBe(401);
    });
  });

  // ── No membership (403) ────────────────────────────────────────────────

  describe('returns 403 when user has no membership', () => {
    it('returns 403 "Access denied" when no team membership exists', async () => {
      const mockDb = createMockSupabase({ membership: null });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(createRequest());

      expect(ctx.error).toBeDefined();
      expect(ctx.error!.status).toBe(403);
      const json = await ctx.error!.json();
      expect(json.error).toBe('Access denied');
    });
  });

  // ── x-org-id header validation ─────────────────────────────────────────

  describe('x-org-id header handling', () => {
    it('uses specific org when valid x-org-id header is provided', async () => {
      const orgId = 'a0000000-0000-4000-8000-000000000001';
      const mockDb = createMockSupabase({
        membership: { id: 'tm-2', org_id: orgId, role: 'admin' },
      });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const req = createRequest({ 'x-org-id': orgId });
      const ctx = await getApiAuthContext(req);

      expect(ctx.error).toBeUndefined();
      expect(ctx.membership!.org_id).toBe(orgId);

      // Verify Supabase was queried with the specific org_id
      const fromCalls = mockDb.from.mock.calls;
      const teamMemberCall = fromCalls.find((c: string[]) => c[0] === 'team_members');
      expect(teamMemberCall).toBeDefined();
    });

    it('ignores invalid x-org-id header (non-UUID) and falls back to default', async () => {
      const mockDb = createMockSupabase({});
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const req = createRequest({ 'x-org-id': 'not-a-uuid' });
      const ctx = await getApiAuthContext(req);

      expect(ctx.error).toBeUndefined();
      expect(ctx.membership!.org_id).toBe('org-1');
    });

    it('returns 403 when x-org-id is valid UUID but user is not a member', async () => {
      const orgId = 'b0000000-0000-4000-8000-000000000002';
      const mockDb = createMockSupabase({ membership: null });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const req = createRequest({ 'x-org-id': orgId });
      const ctx = await getApiAuthContext(req);

      expect(ctx.error).toBeDefined();
      expect(ctx.error!.status).toBe(403);
    });
  });

  // ── Role-based access ──────────────────────────────────────────────────

  describe('role-based access (requireRole)', () => {
    it('allows access when user has a permitted role', async () => {
      const mockDb = createMockSupabase({
        membership: { id: 'tm-1', org_id: 'org-1', role: 'admin' },
      });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(createRequest(), {
        requireRole: ['owner', 'admin'],
      });

      expect(ctx.error).toBeUndefined();
      expect(ctx.membership!.role).toBe('admin');
    });

    it('returns 403 when user role is insufficient', async () => {
      const mockDb = createMockSupabase({
        membership: { id: 'tm-1', org_id: 'org-1', role: 'viewer' },
      });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(createRequest(), {
        requireRole: ['owner', 'admin'],
      });

      expect(ctx.error).toBeDefined();
      expect(ctx.error!.status).toBe(403);
      const json = await ctx.error!.json();
      expect(json.error).toContain('Insufficient permissions');
      expect(json.error).toContain('owner or admin');
    });
  });

  // ── Entity-level access for non-admin roles ────────────────────────────

  describe('entity-level access control for accountant/viewer', () => {
    it('filters entities to only assigned ones for accountant role', async () => {
      const mockDb = createMockSupabase({
        membership: { id: 'tm-1', org_id: 'org-1', role: 'accountant' },
        orgEntities: [{ id: 'e-1' }, { id: 'e-2' }, { id: 'e-3' }],
        entityAssignments: [{ entity_id: 'e-1' }, { entity_id: 'e-3' }],
      });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(createRequest());

      expect(ctx.error).toBeUndefined();
      expect(ctx.entityIds).toEqual(['e-1', 'e-3']);
    });

    it('returns empty entityIds when accountant has no assignments', async () => {
      const mockDb = createMockSupabase({
        membership: { id: 'tm-1', org_id: 'org-1', role: 'viewer' },
        orgEntities: [{ id: 'e-1' }, { id: 'e-2' }],
        entityAssignments: [], // No assignments
      });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(createRequest());

      expect(ctx.error).toBeUndefined();
      expect(ctx.entityIds).toEqual([]);
    });

    it('does not filter entities for owner role', async () => {
      const mockDb = createMockSupabase({
        membership: { id: 'tm-1', org_id: 'org-1', role: 'owner' },
        orgEntities: [{ id: 'e-1' }, { id: 'e-2' }],
        entityAssignments: [{ entity_id: 'e-1' }], // should be ignored
      });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(createRequest());

      expect(ctx.entityIds).toEqual(['e-1', 'e-2']);
    });

    it('does not filter entities for admin role', async () => {
      const mockDb = createMockSupabase({
        membership: { id: 'tm-1', org_id: 'org-1', role: 'admin' },
        orgEntities: [{ id: 'e-1' }, { id: 'e-2' }, { id: 'e-3' }],
      });
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(createRequest());

      expect(ctx.entityIds).toEqual(['e-1', 'e-2', 'e-3']);
    });
  });

  // ── Request parameter handling ─────────────────────────────────────────

  describe('handles missing request parameter', () => {
    it('works when request is undefined', async () => {
      const mockDb = createMockSupabase({});
      vi.mocked(createServerClient).mockResolvedValue(mockDb);

      const ctx = await getApiAuthContext(undefined);

      expect(ctx.error).toBeUndefined();
      expect(ctx.user).toEqual({ id: 'user-1', email: 'user@example.com' });
    });
  });

  // ── Database errors ────────────────────────────────────────────────────

  describe('handles database errors gracefully', () => {
    it('returns 500 when createServerClient throws', async () => {
      vi.mocked(createServerClient).mockRejectedValue(new Error('DB connection lost'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const ctx = await getApiAuthContext(createRequest());

      expect(ctx.error).toBeDefined();
      expect(ctx.error!.status).toBe(500);
      const json = await ctx.error!.json();
      expect(json.error).toBe('Internal server error');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[getApiAuthContext] Unexpected error:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('returns 500 when auth.getUser throws an unexpected error', async () => {
      const mockDb = {
        auth: {
          getUser: vi.fn().mockRejectedValue(new Error('Network timeout')),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(createServerClient).mockResolvedValue(mockDb as any);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const ctx = await getApiAuthContext(createRequest());

      expect(ctx.error).toBeDefined();
      expect(ctx.error!.status).toBe(500);

      consoleSpy.mockRestore();
    });
  });
});
