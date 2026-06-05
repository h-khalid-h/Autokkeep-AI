import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

const mockGetSlackInstallUrl = vi.fn();
const mockExchangeSlackCode = vi.fn();
vi.mock('@/lib/channels/slack', () => ({
  getSlackInstallUrl: (...args: unknown[]) => mockGetSlackInstallUrl(...args),
  exchangeSlackCode: (...args: unknown[]) => mockExchangeSlackCode(...args),
}));

vi.mock('@/lib/crypto', () => ({
  encryptToken: vi.fn().mockReturnValue('encrypted-token'),
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
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/channels/slack/install');
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/channels/slack/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET, POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('GET /api/channels/slack/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
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

  it('should redirect to Slack install URL on success', async () => {
    const chain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    mockDb.from.mockReturnValue(chain);
    mockGetSlackInstallUrl.mockReturnValue('https://slack.com/oauth/install');

    const req = createGetRequest({ entityId: 'ent-1' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://slack.com/oauth/install');
  });

  it('should return 500 when an error is thrown', async () => {
    const chain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    mockDb.from.mockReturnValue(chain);
    mockGetSlackInstallUrl.mockImplementation(() => { throw new Error('boom'); });

    const req = createGetRequest({ entityId: 'ent-1' });
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to generate Slack install URL');
  });
});

describe('POST /api/channels/slack/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ code: 'abc', entityId: 'ent-1' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('should return 400 when code or entityId is missing', async () => {
    const req = createPostRequest({ code: 'abc' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing code or entityId');
  });

  it('should return 403 when entity does not belong to org', async () => {
    const chain = createChainMock({ data: { org_id: 'other-org' }, error: null });
    mockDb.from.mockReturnValue(chain);

    const req = createPostRequest({ code: 'abc', entityId: 'ent-1' });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('should exchange code and save connection on success', async () => {
    const entityChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const insertChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValueOnce(entityChain).mockReturnValueOnce(insertChain);

    mockExchangeSlackCode.mockResolvedValue({
      ok: true,
      accessToken: 'xoxb-token',
      teamId: 'T123',
      teamName: 'Test Team',
    });

    const req = createPostRequest({ code: 'abc', entityId: 'ent-1' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.teamId).toBe('T123');
  });

  it('should return 400 when Slack exchange fails', async () => {
    const entityChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    mockDb.from.mockReturnValue(entityChain);
    mockExchangeSlackCode.mockResolvedValue({ ok: false, error: 'invalid_code' });

    const req = createPostRequest({ code: 'bad', entityId: 'ent-1' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('invalid_code');
  });

  it('should return 500 when an exception is thrown', async () => {
    const entityChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    mockDb.from.mockReturnValue(entityChain);
    mockExchangeSlackCode.mockRejectedValue(new Error('network'));

    const req = createPostRequest({ code: 'abc', entityId: 'ent-1' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Slack installation failed');
  });
});
