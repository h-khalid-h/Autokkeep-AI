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

// Mock audit log — F15 added audit logging to compliance checks
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock compliance engine
vi.mock('@/lib/compliance', () => ({
  runComplianceCheck: vi.fn().mockReturnValue({
    region: 'estonia',
    score: 85,
    violations: [],
    passed: true,
  }),
}));

// Mock validation — pass-through
vi.mock('@/lib/validation', () => ({
  parseBody: vi.fn(),
  schemas: { complianceCheck: {} },
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

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/compliance/check', {
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
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');
const { parseBody } = await import('@/lib/validation');

describe('POST /api/compliance/check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010', region: 'estonia' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for invalid body (validation failure)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: NextResponse.json(
        { error: 'Validation failed', details: [{ field: 'region', message: 'Invalid' }] },
        { status: 400 },
      ),
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 403 when entity is not found or access denied', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { entityId: 'a0000000-0000-4000-8000-000000000099', region: 'estonia' },
    });

    // Entity lookup returns null
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000099', region: 'estonia' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return 500 when transaction fetch fails', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { entityId: 'a0000000-0000-4000-8000-000000000010', region: 'estonia' },
    });

    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003', base_currency: 'USD', tax_id: null, fiscal_year_end: '12', country: 'EE' },
      error: null,
    });
    const txChain = createChainMock({ data: null, error: { message: 'DB error' } });

    let _callCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') {
        _callCount++;
        return txChain;
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010', region: 'estonia' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch transactions');
  });

  it('should return compliance result for valid request (happy path)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { entityId: 'a0000000-0000-4000-8000-000000000010', region: 'estonia' },
    });

    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003', base_currency: 'USD', tax_id: 'EE123', fiscal_year_end: '12', country: 'EE' },
      error: null,
    });

    const txData = [
      { id: 'tx-1', amount: 100, currency: 'USD', date: '2025-01-01', merchant_name: 'Acme', category_ai: 'Office', category_human: null, document_status: 'complete', gl_name: 'G100' },
    ];

    // transactions chain needs to resolve via .then (no .single)
    const txChain = createChainMock({ data: txData, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010', region: 'estonia' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeDefined();
    expect(json.meta).toBeDefined();
    expect(json.meta.transactionCount).toBe(1);
  });
});
