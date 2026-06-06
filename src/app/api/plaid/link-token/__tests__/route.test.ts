import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/plaid/client', () => ({
  createLinkToken: vi.fn().mockResolvedValue('link-sandbox-abc123'),
}));

const mockDb = { from: vi.fn() };

const mockAuthContext = {
  user: { id: 'a0000000-0000-4000-8000-000000000001', email: 'user@example.com' },
  membership: { id: 'a0000000-0000-4000-8000-000000000002', org_id: 'a0000000-0000-4000-8000-000000000003', role: 'owner' },
  db: mockDb,
  entityIds: ['a0000000-0000-4000-8000-000000000010'],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

vi.mock('@/lib/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation')>();
  return { ...actual };
});

// ─── Helpers ────────────────────────────────────────────────────────────────────

const ENTITY_ID = 'a0000000-0000-4000-8000-000000000010';

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/plaid/link-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
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
const { getApiAuthContext } = await import('@/lib/api-auth');
const { createLinkToken } = await import('@/lib/plaid/client');

describe('POST /api/plaid/link-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ entityId: ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for missing entityId', async () => {
    const req = createPostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 for invalid entityId (not UUID)', async () => {
    const req = createPostRequest({ entityId: 'not-a-uuid' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 403 when entity not found', async () => {
    const entityChain = createChainMock({ data: null, error: { message: 'not found' } });
    mockDb.from.mockReturnValue(entityChain);

    const req = createPostRequest({ entityId: ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return 403 when entityError is set', async () => {
    const entityChain = createChainMock({ data: null, error: { code: 'PGRST116' } });
    mockDb.from.mockReturnValue(entityChain);

    const req = createPostRequest({ entityId: ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return 500 when createLinkToken throws', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'a0000000-0000-4000-8000-000000000003', country: 'US' }, error: null });
    mockDb.from.mockReturnValue(entityChain);
    (createLinkToken as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Plaid API error'));

    const req = createPostRequest({ entityId: ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to create link token');
  });

  it('should return link token on happy path', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'a0000000-0000-4000-8000-000000000003', country: 'US' }, error: null });
    mockDb.from.mockReturnValue(entityChain);
    (createLinkToken as ReturnType<typeof vi.fn>).mockResolvedValue('link-sandbox-xyz789');

    const req = createPostRequest({ entityId: ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.link_token).toBe('link-sandbox-xyz789');
    expect(createLinkToken).toHaveBeenCalledWith('a0000000-0000-4000-8000-000000000001', ENTITY_ID, 'US');
  });
});
