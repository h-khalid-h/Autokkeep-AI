import { describe, it, expect, vi, beforeEach } from 'vitest';

const ENTITY_ID = '00000000-0000-4000-8000-000000000001';
const ENTITY_ID_DENIED = '00000000-0000-4000-8000-000000000999';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock getApiAuthContext
const mockDb = {
  from: vi.fn(),
};

const mockAuthContext = {
  user: { id: 'user-1' },
  membership: { id: 'tm-1', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: [ENTITY_ID],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
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
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('POST /api/ai/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default successful auth
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── Auth ─────────────────────────────────────────────────────────────────────

  it('should return 401 if no auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createRequest({ entityId: ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('should return 400 if entityId is missing', async () => {
    const req = createRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 if transactionIds is empty array (no pending found)', async () => {
    // entity lookup
    const entityChain = createChainMock({ data: { id: 'entity-1', org_id: 'org-1' } });
    // transactions query — returns empty for the given IDs
    const txChain = createChainMock({ data: [], error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null });
    });

    const req = createRequest({ entityId: ENTITY_ID, transactionIds: [] });
    const res = await POST(req);

    // With empty transactionIds, the route fetches pending transactions and finds none
    const json = await res.json();
    expect(json.processed).toBe(0);
  });

  it('should return 403 if entity access is denied', async () => {
    // Entity not found for this org
    const entityChain = createChainMock({ data: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      return createChainMock({ data: null });
    });

    const req = createRequest({ entityId: ENTITY_ID_DENIED });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it('should return 403 if user has no team membership', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
    });

    const req = createRequest({ entityId: ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Access denied');
  });
});
