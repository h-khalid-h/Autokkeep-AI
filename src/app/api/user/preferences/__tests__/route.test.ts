import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/user-channel-prefs', () => ({
  getUserChannelPreference: vi.fn().mockResolvedValue({
    channel: 'email',
    identifier: 'user@example.com',
  }),
  setUserChannelPreference: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/validation', () => ({
  parseBody: vi.fn(),
  schemas: { userPreferences: {} },
}));

// Mock getApiAuthContext
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

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/user/preferences');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

function createPutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/user/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET, PUT } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');
const { parseBody } = await import('@/lib/validation');

// ─── GET Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/user/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when entityId is missing', async () => {
    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('entityId query parameter is required');
  });

  it('should return 403 when entity is not accessible', async () => {
    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return preference (happy path)', async () => {
    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preference).toBeDefined();
    expect(json.preference.channel).toBe('email');
    expect(json.preference.identifier).toBe('user@example.com');
  });
});

// ─── PUT Tests ──────────────────────────────────────────────────────────────────

describe('PUT /api/user/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPutRequest({
      entityId: 'a0000000-0000-4000-8000-000000000010',
      channel: 'slack',
      identifier: '#general',
    });
    const res = await PUT(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for invalid body (validation failure)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: NextResponse.json(
        { error: 'Validation failed', details: [{ field: 'channel', message: 'Required' }] },
        { status: 400 },
      ),
    });

    const req = createPutRequest({});
    const res = await PUT(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 403 when entity is not accessible', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        entityId: 'a0000000-0000-4000-8000-000000000099',
        channel: 'slack',
        identifier: '#general',
      },
    });

    const req = createPutRequest({
      entityId: 'a0000000-0000-4000-8000-000000000099',
      channel: 'slack',
      identifier: '#general',
    });
    const res = await PUT(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should update preference and return success (happy path)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        entityId: 'a0000000-0000-4000-8000-000000000010',
        channel: 'slack',
        identifier: '#finance',
      },
    });

    const req = createPutRequest({
      entityId: 'a0000000-0000-4000-8000-000000000010',
      channel: 'slack',
      identifier: '#finance',
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
