import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  withSentryHandler: vi.fn((handler: unknown) => handler),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockCompileWeeklyDigest = vi.fn();
vi.mock('@/lib/notifications/digest', () => ({
  compileWeeklyDigest: (...args: unknown[]) => mockCompileWeeklyDigest(...args),
}));

const mockSendDigestEmail = vi.fn();
vi.mock('@/lib/email/resend', () => ({
  sendDigestEmail: (...args: unknown[]) => mockSendDigestEmail(...args),
}));

// ─── Supabase admin mock ────────────────────────────────────────────────────────

type QueryResult = { data: unknown; error: null };

let entitiesResult: QueryResult = { data: [], error: null };
let membersResult: QueryResult = { data: [], error: null };


const mockAuthGetUserById = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockImplementation((table: string) => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.in = vi.fn().mockImplementation(() => {
        // Return different data based on which table we're querying
        if (table === 'entities') {
          chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(entitiesResult));
        } else if (table === 'team_members') {
          chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(membersResult));
        }
        return chain;
      });
      chain.then = vi.fn((resolve: (v: unknown) => void) => {
        if (table === 'entities') resolve(entitiesResult);
        else if (table === 'team_members') resolve(membersResult);
        else resolve({ data: [], error: null });
      });
      return chain;
    }),
    auth: {
      admin: {
        getUserById: mockAuthGetUserById,
      },
    },
  })),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createCronRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) {
    headers['authorization'] = `Bearer ${secret}`;
  }
  return new NextRequest('http://localhost:3000/api/cron/weekly-digest', {
    method: 'GET',
    headers,
  });
}

function makeDigestResult(overrides: Partial<{
  totalEntities: number;
  totalItems: number;
  totalValue: number;
  entities: Array<{
    entityId: string;
    entityName: string;
    itemCount: number;
    totalValue: number;
    escrowCount: number;
    humanReviewCount: number;
    topItems: Array<{ merchant_name: string; amount: number; status: string }>;
  }>;
}> = {}) {
  return {
    generatedAt: new Date().toISOString(),
    totalEntities: 0,
    totalItems: 0,
    totalValue: 0,
    entities: [],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../../weekly-digest/route');

describe('GET /api/cron/weekly-digest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.RESEND_API_KEY = 'test-resend-key';

    entitiesResult = { data: [], error: null };
    membersResult = { data: [], error: null };
  });

  it('returns 401 without CRON_SECRET header', async () => {
    const req = createCronRequest(); // no auth header
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 with wrong CRON_SECRET', async () => {
    const req = createCronRequest('wrong-secret');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('handles no organizations (empty digest entities)', async () => {
    mockCompileWeeklyDigest.mockResolvedValue(makeDigestResult());

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.digest.entities).toEqual([]);
    expect(json.emailResults).toEqual([]);
  });

  it('handles entities with empty member lists', async () => {
    mockCompileWeeklyDigest.mockResolvedValue(makeDigestResult({
      totalEntities: 1,
      totalItems: 3,
      totalValue: 500,
      entities: [
        {
          entityId: 'entity-1',
          entityName: 'Test Corp',
          itemCount: 3,
          totalValue: 500,
          escrowCount: 1,
          humanReviewCount: 2,
          topItems: [{ merchant_name: 'Amazon', amount: 200, status: 'escrow_suspense' }],
        },
      ],
    }));

    // Entity found but no team members
    entitiesResult = { data: [{ id: 'entity-1', org_id: 'org-1' }], error: null };
    membersResult = { data: [], error: null };

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.emailResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'Test Corp', success: false, error: 'No admin users' }),
      ])
    );
  });

  it('sends digest emails successfully', async () => {
    mockCompileWeeklyDigest.mockResolvedValue(makeDigestResult({
      totalEntities: 1,
      totalItems: 5,
      totalValue: 1000,
      entities: [
        {
          entityId: 'entity-1',
          entityName: 'Test Corp',
          itemCount: 5,
          totalValue: 1000,
          escrowCount: 2,
          humanReviewCount: 3,
          topItems: [{ merchant_name: 'Amazon', amount: 200, status: 'escrow_suspense' }],
        },
      ],
    }));

    entitiesResult = { data: [{ id: 'entity-1', org_id: 'org-1' }], error: null };
    membersResult = { data: [{ user_id: 'user-1', role: 'admin', org_id: 'org-1' }], error: null };

    mockAuthGetUserById.mockResolvedValue({
      data: { user: { email: 'admin@test.com' } },
    });

    mockSendDigestEmail.mockResolvedValue({ success: true, id: 'email-1' });

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.emailResults).toHaveLength(1);
    expect(json.emailResults[0].success).toBe(true);
    expect(mockSendDigestEmail).toHaveBeenCalledTimes(1);
  });

  it('skips email delivery when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;
    mockCompileWeeklyDigest.mockResolvedValue(makeDigestResult({
      totalEntities: 1,
      entities: [
        {
          entityId: 'entity-1',
          entityName: 'Test Corp',
          itemCount: 1,
          totalValue: 100,
          escrowCount: 0,
          humanReviewCount: 1,
          topItems: [],
        },
      ],
    }));

    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockSendDigestEmail).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('returns 500 when compileWeeklyDigest throws', async () => {
    mockCompileWeeklyDigest.mockRejectedValue(new Error('Database unavailable'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Weekly digest compilation failed');

    consoleSpy.mockRestore();
  });
});
