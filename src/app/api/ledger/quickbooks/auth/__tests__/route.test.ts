import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

const mockGetQBOAuthUrl = vi.fn();
const mockExchangeQBOCode = vi.fn();
vi.mock('@/lib/ledger/sync', () => ({
  getQBOAuthUrl: (...args: unknown[]) => mockGetQBOAuthUrl(...args),
  exchangeQBOCode: (...args: unknown[]) => mockExchangeQBOCode(...args),
  refreshQBOToken: vi.fn(),
}));

vi.mock('@/lib/crypto', () => ({
  encryptToken: vi.fn().mockReturnValue('encrypted'),
  decryptToken: vi.fn().mockReturnValue('decrypted'),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
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
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/ledger/quickbooks/auth');
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/ledger/quickbooks/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeSignedState(entityId: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ entityId, ts: Date.now() })).toString('base64');
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET, POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('GET /api/ledger/quickbooks/auth', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
    process.env.OAUTH_STATE_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest({ entityId: 'ent-1' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('should return 400 when entityId is missing', async () => {
    const req = createGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing entityId');
  });

  it('should return 403 when entity does not belong to org', async () => {
    const chain = createChainMock({ data: { org_id: 'other-org' }, error: null });
    mockDb.from.mockReturnValue(chain);

    const req = createGetRequest({ entityId: 'ent-1' });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('should return 500 when OAUTH_STATE_SECRET is missing', async () => {
    delete process.env.OAUTH_STATE_SECRET;
    delete process.env.CRON_SECRET;

    const chain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    mockDb.from.mockReturnValue(chain);

    const req = createGetRequest({ entityId: 'ent-1' });
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Server configuration error');
  });

  it('should redirect to QuickBooks auth URL on success', async () => {
    const chain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    mockDb.from.mockReturnValue(chain);
    mockGetQBOAuthUrl.mockReturnValue('https://quickbooks.intuit.com/oauth');

    const req = createGetRequest({ entityId: 'ent-1' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://quickbooks.intuit.com/oauth');
  });
});

describe('POST /api/ledger/quickbooks/auth', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
    process.env.OAUTH_STATE_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const state = makeSignedState('ent-1', 'test-secret');
    const req = createPostRequest({ code: 'abc', realmId: 'r-1', state });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('should return 400 when code is missing', async () => {
    const req = createPostRequest({ realmId: 'r-1' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing code or realmId');
  });

  it('should return 400 when state signature is invalid', async () => {
    const req = createPostRequest({ code: 'abc', realmId: 'r-1', state: 'bad.signature' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should exchange code and save connection on success', async () => {
    const state = makeSignedState('ent-1', 'test-secret');
    const entityChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const upsertChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValueOnce(entityChain).mockReturnValueOnce(upsertChain).mockReturnValue(upsertChain);

    mockExchangeQBOCode.mockResolvedValue({
      accessToken: 'at-123',
      refreshToken: 'rt-123',
      expiresIn: 3600,
    });

    const req = createPostRequest({ code: 'abc', realmId: 'r-1', state });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.provider).toBe('quickbooks');
    expect(json.realmId).toBe('r-1');
  });

  it('should return 500 when exchange throws', async () => {
    const state = makeSignedState('ent-1', 'test-secret');
    const entityChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    mockDb.from.mockReturnValue(entityChain);
    mockExchangeQBOCode.mockRejectedValue(new Error('API error'));

    const req = createPostRequest({ code: 'abc', realmId: 'r-1', state });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('QuickBooks authentication failed');
  });
});
