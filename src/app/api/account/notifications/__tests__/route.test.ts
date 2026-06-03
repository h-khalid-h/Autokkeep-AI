import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Sentry
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock Supabase server client
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockServerClient = {
  auth: {
    getUser: mockGetUser,
  },
  from: mockFrom,
};
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockServerClient),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createGetRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/notifications', { method: 'GET' });
}

function createPutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
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
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

const MOCK_USER = { id: 'a0000000-0000-4000-8000-000000000001', email: 'user@example.com' };

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET, PUT } = await import('../route');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/account/notifications
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/account/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return default preferences when none stored', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: MOCK_USER },
      error: null,
    });

    // No existing preferences — data is empty array
    const chain = createChainMock({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    // Defaults: email=true, slack=false, sms=false
    expect(json.email).toBe(true);
    expect(json.slack).toBe(false);
    expect(json.sms).toBe(false);
  });

  it('should return stored preferences', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: MOCK_USER },
      error: null,
    });

    const storedPrefs = { email: false, slack: true, sms: true };
    const chain = createChainMock({ data: [storedPrefs], error: null });
    mockFrom.mockReturnValue(chain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.email).toBe(false);
    expect(json.slack).toBe(true);
    expect(json.sms).toBe(true);
  });

  it('should return 500 when database query fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: MOCK_USER },
      error: null,
    });

    const chain = createChainMock({ data: null, error: { message: 'DB error' } });
    mockFrom.mockReturnValue(chain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch preferences');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/account/notifications
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /api/account/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const req = createPutRequest({ email: true });
    const res = await PUT(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for invalid field types', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: MOCK_USER },
      error: null,
    });

    const req = createPutRequest({ email: 'yes' }); // should be boolean
    const res = await PUT(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should upsert preferences and return updated values', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: MOCK_USER },
      error: null,
    });

    const upsertedPrefs = { email: true, slack: true, sms: false };
    const chain = createChainMock({ data: upsertedPrefs, error: null });
    mockFrom.mockReturnValue(chain);

    const req = createPutRequest({ email: true, slack: true });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.email).toBe(true);
    expect(json.slack).toBe(true);
    expect(json.sms).toBe(false);
  });

  it('should use defaults for missing optional fields', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: MOCK_USER },
      error: null,
    });

    // Only sending sms=true, email and slack should default
    const upsertedPrefs = { email: true, slack: false, sms: true };
    const chain = createChainMock({ data: upsertedPrefs, error: null });
    mockFrom.mockReturnValue(chain);

    const req = createPutRequest({ sms: true });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.email).toBe(true);
    expect(json.slack).toBe(false);
    expect(json.sms).toBe(true);
  });

  it('should return 500 when upsert fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: MOCK_USER },
      error: null,
    });

    const chain = createChainMock({ data: null, error: { message: 'Upsert failed' } });
    mockFrom.mockReturnValue(chain);

    const req = createPutRequest({ email: false });
    const res = await PUT(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to save preferences');
  });
});
