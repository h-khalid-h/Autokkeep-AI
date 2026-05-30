import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Supabase server client
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSupabase = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
};

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockSupabase),
}));

// Mock AI categorizer
vi.mock('@/lib/ai/categorizer', () => ({
  batchCategorize: vi.fn().mockResolvedValue(new Map()),
}));

// Mock audit log
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock confidence triage
vi.mock('@/lib/ai/confidence', () => ({
  triageTransaction: vi.fn().mockReturnValue({
    decision: 'auto_commit',
    targetStatus: 'auto_categorized',
    notificationChannel: 'none',
    confidence: {
      pLlm: 1,
      sRule: 1,
      mDoc: 1,
      compositeScore: 1,
      reasoning: 'test',
    },
  }),
}));

// Mock privacy parser
vi.mock('@/lib/ai/privacy-parser', () => ({
  generateCitationToken: vi.fn().mockReturnValue('mock-citation-token'),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/ai/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler = () => chain;

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  // When the chain is awaited directly (no .single()), return the resolved value
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

// Import the route handler AFTER mocks are set up
const { POST } = await import('../../batch/../../../api/ai/batch/route');

describe('POST /api/ai/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────────

  it('should return 401 if no auth', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const req = createRequest({ entityId: 'entity-1' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('should return 400 if entityId is missing', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const req = createRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('entityId');
  });

  it('should return 400 if transactionIds is empty array (no pending found)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    // team_members lookup
    const memberChain = createChainMock({ data: { id: 'tm-1', org_id: 'org-1' } });
    // entity lookup
    const entityChain = createChainMock({ data: { id: 'entity-1', org_id: 'org-1' } });
    // transactions query — returns empty for the given IDs
    const txChain = createChainMock({ data: [], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'team_members') return memberChain;
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null });
    });

    const req = createRequest({ entityId: 'entity-1', transactionIds: [] });
    const res = await POST(req);

    // With empty transactionIds, the route fetches pending transactions and finds none
    const json = await res.json();
    expect(json.processed).toBe(0);
  });

  it('should return 403 if entity access is denied', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    // Member exists but entity not found for this org
    const memberChain = createChainMock({ data: { id: 'tm-1', org_id: 'org-1' } });
    const entityChain = createChainMock({ data: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'team_members') return memberChain;
      if (table === 'entities') return entityChain;
      return createChainMock({ data: null });
    });

    const req = createRequest({ entityId: 'entity-999' });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it('should return 403 if user has no team membership', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const memberChain = createChainMock({ data: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'team_members') return memberChain;
      return createChainMock({ data: null });
    });

    const req = createRequest({ entityId: 'entity-1' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Access denied');
  });
});
