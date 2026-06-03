import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Sentry
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

// Mock audit log
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock getApiAuthContext
const mockDb = { from: vi.fn() };

const mockAuthContext = {
  user: { id: 'user-1', email: 'user@example.com' },
  membership: { id: 'tm-1', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: ['entity-1'],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// Mock Supabase admin client
const mockAdminFrom = vi.fn();
const mockAdminAuthDeleteUser = vi.fn().mockResolvedValue({ error: null });
const mockAdminSupabase = {
  from: mockAdminFrom,
  auth: { admin: { deleteUser: mockAdminAuthDeleteUser } },
  storage: {
    from: vi.fn().mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminSupabase),
}));

// Mock Stripe
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    subscriptions: {
      cancel: vi.fn().mockResolvedValue({}),
    },
  })),
}));

// Mock Plaid client
vi.mock('@/lib/plaid/client', () => ({
  removeItem: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/delete', {
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
  chain.in = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createRequest({ confirmation: 'DELETE' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('should return 400 without confirmation string', async () => {
    const req = createRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Validation failed');
  });

  it('should return 400 with wrong confirmation string', async () => {
    const req = createRequest({ confirmation: 'REMOVE' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Validation failed');
  });

  // ── Happy Path ────────────────────────────────────────────────────────────

  it('should delete account with correct confirmation', async () => {
    // No memberships (simplest case)
    const membershipsChain = createChainMock({ data: [], error: null });
    const auditChain = createChainMock({ data: null, error: null });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'team_members') return membershipsChain;
      if (table === 'audit_log') return auditChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createRequest({ confirmation: 'DELETE' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Verify auth user was deleted
    expect(mockAdminAuthDeleteUser).toHaveBeenCalledWith('user-1');
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('should return 500 if auth user deletion fails', async () => {
    const membershipsChain = createChainMock({ data: [], error: null });
    const auditChain = createChainMock({ data: null, error: null });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'team_members') return membershipsChain;
      if (table === 'audit_log') return auditChain;
      return createChainMock({ data: null, error: null });
    });

    mockAdminAuthDeleteUser.mockResolvedValueOnce({ error: { message: 'Delete failed' } });

    const req = createRequest({ confirmation: 'DELETE' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Failed to delete');
  });
});
