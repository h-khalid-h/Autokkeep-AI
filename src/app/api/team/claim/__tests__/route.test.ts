import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/validation', () => ({
  parseBody: vi.fn(),
  schemas: { teamClaim: {} },
}));

// Mock Supabase server client
const mockDb = { from: vi.fn() };
const mockAuth = {
  getUser: vi.fn(),
};
const mockSupabase = {
  auth: mockAuth,
  from: mockDb.from,
};

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockSupabase),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/team/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { parseBody } = await import('@/lib/validation');

describe('POST /api/team/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated user
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: 'a0000000-0000-4000-8000-000000000001', email: 'user@example.com' } },
      error: null,
    });
    // Wire supabase.from through mockDb
    mockSupabase.from = mockDb.from;
  });

  it('should return 401 without auth', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const req = createPostRequest({ inviteId: 'a0000000-0000-4000-8000-000000000050' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for validation failure', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: NextResponse.json(
        { error: 'Validation failed', details: [{ field: 'inviteId', message: 'Invalid uuid' }] },
        { status: 400 },
      ),
    });

    const req = createPostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 404 when invite not found', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { inviteId: 'a0000000-0000-4000-8000-000000000099' },
    });

    const inviteChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(inviteChain);

    const req = createPostRequest({ inviteId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Invite not found');
  });

  it('should return 403 when invite email does not match user', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { inviteId: 'a0000000-0000-4000-8000-000000000050' },
    });

    const inviteChain = createChainMock({
      data: {
        id: 'a0000000-0000-4000-8000-000000000050',
        org_id: 'a0000000-0000-4000-8000-000000000003',
        role: 'accountant',
        invited_email: 'other@example.com',
        user_id: null,
        accepted_at: null,
      },
      error: null,
    });
    mockDb.from.mockReturnValue(inviteChain);

    const req = createPostRequest({ inviteId: 'a0000000-0000-4000-8000-000000000050' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('This invite is not for your account');
  });

  it('should return success with alreadyClaimed when invite already claimed', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { inviteId: 'a0000000-0000-4000-8000-000000000050' },
    });

    const inviteChain = createChainMock({
      data: {
        id: 'a0000000-0000-4000-8000-000000000050',
        org_id: 'a0000000-0000-4000-8000-000000000003',
        role: 'accountant',
        invited_email: 'user@example.com',
        user_id: 'a0000000-0000-4000-8000-000000000001',
        accepted_at: '2025-01-01T00:00:00Z',
      },
      error: null,
    });
    mockDb.from.mockReturnValue(inviteChain);

    const req = createPostRequest({ inviteId: 'a0000000-0000-4000-8000-000000000050' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.alreadyClaimed).toBe(true);
    expect(json.org_id).toBe('a0000000-0000-4000-8000-000000000003');
  });

  it('should claim invite successfully (happy path)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { inviteId: 'a0000000-0000-4000-8000-000000000050' },
    });

    const inviteChain = createChainMock({
      data: {
        id: 'a0000000-0000-4000-8000-000000000050',
        org_id: 'a0000000-0000-4000-8000-000000000003',
        role: 'accountant',
        invited_email: 'user@example.com',
        user_id: null,
        accepted_at: null,
      },
      error: null,
    });

    const updateChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockDb.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return inviteChain; // select
      return updateChain; // update
    });

    const req = createPostRequest({ inviteId: 'a0000000-0000-4000-8000-000000000050' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.org_id).toBe('a0000000-0000-4000-8000-000000000003');
    expect(json.alreadyClaimed).toBeUndefined();
  });

  it('should return 500 when update fails', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { inviteId: 'a0000000-0000-4000-8000-000000000050' },
    });

    const inviteChain = createChainMock({
      data: {
        id: 'a0000000-0000-4000-8000-000000000050',
        org_id: 'a0000000-0000-4000-8000-000000000003',
        role: 'accountant',
        invited_email: 'user@example.com',
        user_id: null,
        accepted_at: null,
      },
      error: null,
    });

    const updateChain = createChainMock({ data: null, error: { message: 'DB error' } });

    let callCount = 0;
    mockDb.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return inviteChain;
      return updateChain;
    });

    const req = createPostRequest({ inviteId: 'a0000000-0000-4000-8000-000000000050' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to claim invite');
  });
});
