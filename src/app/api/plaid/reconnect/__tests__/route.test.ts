import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

const mockCreateUpdateLinkToken = vi.fn();
vi.mock('@/lib/plaid/client', () => ({
  createUpdateLinkToken: (...args: unknown[]) => mockCreateUpdateLinkToken(...args),
}));

vi.mock('@/lib/crypto', () => ({
  decryptToken: vi.fn().mockReturnValue('decrypted-access-token'),
}));

const mockDb = { from: vi.fn() };
const mockAuthContext = {
  user: { id: 'a0000000-0000-4000-8000-000000000001', email: 'user@example.com' },
  membership: { id: 'a0000000-0000-4000-8000-000000000002', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: ['ent-1'],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/plaid/reconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('POST /api/plaid/reconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ connectionId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('should return 400 when connectionId is invalid', async () => {
    const req = createPostRequest({ connectionId: 'not-a-uuid' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 404 when connection not found', async () => {
    const chain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(chain);

    const req = createPostRequest({ connectionId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Connection not found or access denied');
  });

  it('should return 404 when connection org does not match', async () => {
    const chain = createChainMock({
      data: { id: 'conn-1', plaid_access_token: 'enc-token', entity: { org_id: 'other-org' } },
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const req = createPostRequest({ connectionId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('should return link_token on success', async () => {
    const chain = createChainMock({
      data: { id: 'conn-1', plaid_access_token: 'enc-token', entity: { org_id: 'org-1' } },
      error: null,
    });
    mockDb.from.mockReturnValue(chain);
    mockCreateUpdateLinkToken.mockResolvedValue('link-sandbox-token-123');

    const req = createPostRequest({ connectionId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.link_token).toBe('link-sandbox-token-123');
  });

  it('should return 500 when createUpdateLinkToken throws', async () => {
    const chain = createChainMock({
      data: { id: 'conn-1', plaid_access_token: 'enc-token', entity: { org_id: 'org-1' } },
      error: null,
    });
    mockDb.from.mockReturnValue(chain);
    mockCreateUpdateLinkToken.mockRejectedValue(new Error('Plaid API error'));

    const req = createPostRequest({ connectionId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to create reconnect token');
  });
});
