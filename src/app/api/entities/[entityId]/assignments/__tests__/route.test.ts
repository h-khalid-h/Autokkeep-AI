import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock getApiAuthContext
const mockDb = { from: vi.fn() };

const VALID_ENTITY_ID = 'c1a2b3c4-d5e6-4f78-9abc-def012345678';
const VALID_ENTITY_ID_2 = 'd2b3c4d5-e6f7-4890-abcd-ef0123456789';
const VALID_USER_ID = 'e3c4d5e6-f789-4012-bcde-f01234567890';

const mockAuthContext = {
  user: { id: 'b0000000-0000-4000-8000-000000000001', email: 'admin@example.com' },
  membership: { id: 'tm-1', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: [VALID_ENTITY_ID, VALID_ENTITY_ID_2],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

// UUIDs defined above alongside mockAuthContext

function createRouteContext(entityId: string) {
  return { params: Promise.resolve({ entityId }) };
}

function createGetRequest(): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/entities/${VALID_ENTITY_ID}/assignments`,
    { method: 'GET' }
  );
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/entities/${VALID_ENTITY_ID}/assignments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function createDeleteRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/entities/${VALID_ENTITY_ID}/assignments`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET, POST, DELETE } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('Entity Assignments API /api/entities/[entityId]/assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── GET ────────────────────────────────────────────────────────────────────

  describe('GET', () => {
    it('should return assignments for an entity (owner/admin)', async () => {
      const assignments = [
        { id: 'a1', entity_id: VALID_ENTITY_ID, user_id: VALID_USER_ID, assigned_by: 'b0000000-0000-4000-8000-000000000001', created_at: '2024-01-01' },
      ];
      const chain = createChainMock({ data: assignments, error: null });
      mockDb.from.mockReturnValue(chain);

      const req = createGetRequest();
      const res = await GET(req, createRouteContext(VALID_ENTITY_ID));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(assignments);
    });

    it('should return 403 for non-admin users', async () => {
      (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: NextResponse.json(
          { error: 'Insufficient permissions. Required: owner or admin' },
          { status: 403 }
        ),
      });

      const req = createGetRequest();
      const res = await GET(req, createRouteContext(VALID_ENTITY_ID));

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Insufficient permissions');
    });
  });

  // ── POST ───────────────────────────────────────────────────────────────────

  describe('POST', () => {
    it('should add a user assignment', async () => {
      // team_members lookup: user is a regular viewer
      const memberChain = createChainMock({
        data: [{ id: 'tm-2', role: 'viewer' }],
        error: null,
      });
      // entity_assignments upsert
      const upsertChain = createChainMock({
        data: { id: 'a1', entity_id: VALID_ENTITY_ID, user_id: VALID_USER_ID, assigned_by: 'b0000000-0000-4000-8000-000000000001', created_at: '2024-01-01' },
        error: null,
      });

      mockDb.from.mockImplementation((table: string) => {
        if (table === 'team_members') return memberChain;
        if (table === 'entity_assignments') return upsertChain;
        return createChainMock({ data: null, error: null });
      });

      const req = createPostRequest({ userId: VALID_USER_ID });
      const res = await POST(req, createRouteContext(VALID_ENTITY_ID));

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.entity_id).toBe(VALID_ENTITY_ID);
      expect(json.user_id).toBe(VALID_USER_ID);
    });

    it('should validate UUID format for userId', async () => {
      const req = createPostRequest({ userId: 'not-a-uuid' });
      const res = await POST(req, createRouteContext(VALID_ENTITY_ID));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details).toBeDefined();
    });

    it('should auto-assign owner/admin to all entities', async () => {
      // team_members lookup: user is an admin
      const memberChain = createChainMock({
        data: [{ id: 'tm-2', role: 'admin' }],
        error: null,
      });
      // entity_assignments bulk upsert
      const bulkChain = createChainMock({ data: null, error: null });

      mockDb.from.mockImplementation((table: string) => {
        if (table === 'team_members') return memberChain;
        if (table === 'entity_assignments') return bulkChain;
        return createChainMock({ data: null, error: null });
      });

      const req = createPostRequest({ userId: VALID_USER_ID });
      const res = await POST(req, createRouteContext(VALID_ENTITY_ID));

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.message).toContain('auto-assigned to all entities');
      expect(json.count).toBe(2); // entity-1, entity-2
    });
  });

  // ── DELETE ─────────────────────────────────────────────────────────────────

  describe('DELETE', () => {
    it('should remove a user assignment', async () => {
      const deleteChain = createChainMock({ data: null, error: null, count: 1 });
      mockDb.from.mockReturnValue(deleteChain);

      const req = createDeleteRequest({ userId: VALID_USER_ID });
      const res = await DELETE(req, createRouteContext(VALID_ENTITY_ID));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toBe('Assignment removed');
    });

    it('should validate userId is required', async () => {
      const req = createDeleteRequest({});
      const res = await DELETE(req, createRouteContext(VALID_ENTITY_ID));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details).toBeDefined();
    });
  });
});
