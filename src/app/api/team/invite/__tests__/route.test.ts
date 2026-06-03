import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Resend (email service)
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }),
    },
  })),
}));

// Mock getApiAuthContext
const mockDb = { from: vi.fn() };

const mockAuthContext = {
  user: { id: 'user-1', email: 'admin@example.com' },
  membership: { id: 'tm-1', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: ['entity-1'],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/team/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('POST /api/team/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
    // No RESEND_API_KEY → record is created but email is skipped
    delete process.env.RESEND_API_KEY;
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createRequest({ email: 'new@example.com', role: 'viewer' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 403 for viewer role (insufficient permissions)', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json(
        { error: 'Insufficient permissions. Required: owner or admin' },
        { status: 403 }
      ),
    });

    const req = createRequest({ email: 'new@example.com', role: 'viewer' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Insufficient permissions');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('should return 400 for missing email', async () => {
    const req = createRequest({ role: 'viewer' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Email is required');
  });

  it('should return 400 for invalid email format', async () => {
    const req = createRequest({ email: 'not-an-email', role: 'viewer' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid email format');
  });

  it('should return 400 for invalid role', async () => {
    const req = createRequest({ email: 'new@example.com', role: 'superadmin' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid role');
  });

  // ── Happy Path ────────────────────────────────────────────────────────────

  it('should create invite and return success', async () => {
    // seat count check
    const seatChain = createChainMock({ data: null, error: null, count: 1 });
    // subscription check
    const subChain = createChainMock({ data: { plan: 'smb_growth' }, error: null });
    // existing member check
    const existingMemberChain = createChainMock({ data: null, error: null });
    // insert chain
    const insertChain = createChainMock({ data: null, error: null });

    let fromCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'team_members') {
        fromCallCount++;
        if (fromCallCount === 1) return seatChain; // seat count
        if (fromCallCount === 2) return existingMemberChain; // existing check
        return insertChain; // insert
      }
      if (table === 'subscriptions') return subChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createRequest({ email: 'new@example.com', role: 'viewer' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('should return 409 if user already invited', async () => {
    const seatChain = createChainMock({ data: null, error: null, count: 1 });
    const subChain = createChainMock({ data: { plan: 'smb_growth' }, error: null });
    const existingMemberChain = createChainMock({
      data: { id: 'existing-1', user_id: null, invited_email: 'new@example.com' },
      error: null,
    });

    let fromCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'team_members') {
        fromCallCount++;
        if (fromCallCount === 1) return seatChain;
        return existingMemberChain;
      }
      if (table === 'subscriptions') return subChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createRequest({ email: 'new@example.com', role: 'viewer' });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('already a member');
  });
});
