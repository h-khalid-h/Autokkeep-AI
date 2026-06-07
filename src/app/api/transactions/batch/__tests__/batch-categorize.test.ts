import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ENTITY_ID = '00000000-0000-4000-8000-000000000001';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mockWriteAuditLog,
}));

const mockDb = { from: vi.fn() };

const mockAuthContext = {
  user: { id: 'user-1', email: 'user@example.com' },
  membership: { id: 'tm-1', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: [ENTITY_ID],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/transactions/batch', {
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
  chain.not = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

const TX_IDS = [
  '11111111-1111-4000-8000-000000000001',
  '22222222-2222-4000-8000-000000000002',
  '33333333-3333-4000-8000-000000000003',
];

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../../batch/route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('POST /api/transactions/batch (categorize)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('should bulk categorize transactions successfully', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'org-1' } });
    const _txFetchChain = createChainMock({
      data: TX_IDS.map((id) => ({
        id,
        date: '2025-06-01',
        amount: 100,
        entity_id: ENTITY_ID,
      })),
      error: null,
    });
    const periodsChain = createChainMock({ data: [], error: null });
    const updateChain = createChainMock({
      data: TX_IDS.map((id) => ({ id })),
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') {
        // First call is fetch, subsequent is update
        const chain = createChainMock({
          data: TX_IDS.map((id) => ({
            id,
            date: '2025-06-01',
            amount: 100,
            entity_id: ENTITY_ID,
          })),
          error: null,
        });
        chain.update = vi.fn().mockReturnValue(updateChain);
        return chain;
      }
      if (table === 'accounting_periods') return periodsChain;
      if (table === 'audit_log') return createChainMock({ data: null });
      return createChainMock({ data: null });
    });

    const req = createRequest({
      transactionIds: TX_IDS,
      action: 'categorize',
      entityId: ENTITY_ID,
      glCode: '6200-meals',
      glName: 'Meals & Entertainment',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.action).toBe('categorize');
    expect(json.glCode).toBe('6200-meals');
    expect(json.updated).toBe(3);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('should return 400 when glCode is missing for categorize action', async () => {
    const req = createRequest({
      transactionIds: TX_IDS,
      action: 'categorize',
      entityId: ENTITY_ID,
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('should return 400 when glCode is empty for categorize action', async () => {
    const req = createRequest({
      transactionIds: TX_IDS,
      action: 'categorize',
      entityId: ENTITY_ID,
      glCode: '',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  // ── Mixed actions still work ────────────────────────────────────────────────

  it('should still handle approve action normally', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'org-1' } });
    const _txFetchChain = createChainMock({
      data: TX_IDS.map((id) => ({
        id,
        date: '2025-06-01',
        amount: 50,
        entity_id: ENTITY_ID,
      })),
      error: null,
    });
    const periodsChain = createChainMock({ data: [], error: null });
    const thresholdsChain = createChainMock({ data: [], error: null });
    const updateChain = createChainMock({
      data: TX_IDS.map((id) => ({ id })),
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') {
        const chain = createChainMock({
          data: TX_IDS.map((id) => ({
            id,
            date: '2025-06-01',
            amount: 50,
            entity_id: ENTITY_ID,
          })),
          error: null,
        });
        chain.update = vi.fn().mockReturnValue(updateChain);
        return chain;
      }
      if (table === 'accounting_periods') return periodsChain;
      if (table === 'approval_thresholds') return thresholdsChain;
      if (table === 'audit_log') return createChainMock({ data: null });
      return createChainMock({ data: null });
    });

    const req = createRequest({
      transactionIds: TX_IDS,
      action: 'approve',
      entityId: ENTITY_ID,
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.action).toBe('approve');
  });

  it('should still handle reject action normally', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'org-1' } });
    const _txFetchChain = createChainMock({
      data: [{ id: TX_IDS[0], date: '2025-06-01', amount: 100, entity_id: ENTITY_ID }],
      error: null,
    });
    const periodsChain = createChainMock({ data: [], error: null });
    const updateChain = createChainMock({
      data: [{ id: TX_IDS[0] }],
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') {
        const chain = createChainMock({
          data: [{ id: TX_IDS[0], date: '2025-06-01', amount: 100, entity_id: ENTITY_ID }],
          error: null,
        });
        chain.update = vi.fn().mockReturnValue(updateChain);
        return chain;
      }
      if (table === 'accounting_periods') return periodsChain;
      if (table === 'audit_log') return createChainMock({ data: null });
      return createChainMock({ data: null });
    });

    const req = createRequest({
      transactionIds: [TX_IDS[0]],
      action: 'reject',
      entityId: ENTITY_ID,
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.action).toBe('reject');
  });
});
