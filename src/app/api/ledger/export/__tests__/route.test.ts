import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/ledger/csv-export', () => ({
  exportToCSV: vi.fn().mockResolvedValue(
    'Date,EntryNumber,AccountName,Description,Debit,Credit,Status\n2025-01-15,A1B2C3D4,1000,Office rent,1500.00,,posted'
  ),
  exportToSQL: vi.fn().mockResolvedValue(
    "-- Autokkeep Journal Entry Export\nBEGIN;\nINSERT INTO journal_entries (id) VALUES ('test');\nCOMMIT;\n"
  ),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

const ENTITY_ID = 'a0000000-0000-4000-8000-000000000010';
const ORG_ID = 'a0000000-0000-4000-8000-000000000003';

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/ledger/export');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
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

const { GET } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');
const { exportToCSV, exportToSQL } = await import('@/lib/ledger/csv-export');

describe('GET /api/ledger/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest({ entityId: ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('should return 400 when entityId is missing', async () => {
    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('entityId is required');
  });

  it('should return 400 for invalid format parameter', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: ORG_ID },
      error: null,
    });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: ENTITY_ID, format: 'xml' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('format must be "csv" or "sql"');
  });

  it('should return 403 when entity not found or access denied', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  // ── CSV export ────────────────────────────────────────────────────────────

  it('should return CSV with valid request (default format)', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: ORG_ID },
      error: null,
    });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv');

    const body = await res.text();
    expect(body).toContain('Date,EntryNumber');
    expect(body).toContain('Office rent');

    // Verify exportToCSV was called with correct args
    expect(exportToCSV).toHaveBeenCalledWith(
      mockDb,
      ENTITY_ID,
      { startDate: undefined, endDate: undefined, status: undefined },
    );
  });

  it('should include Content-Disposition header for CSV', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: ORG_ID },
      error: null,
    });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: ENTITY_ID });
    const res = await GET(req);

    const disposition = res.headers.get('Content-Disposition');
    expect(disposition).toContain('attachment; filename=autokkeep-journal-entries-');
    expect(disposition).toContain('.csv');
  });

  // ── SQL export ────────────────────────────────────────────────────────────

  it('should return SQL when format=sql', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: ORG_ID },
      error: null,
    });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: ENTITY_ID, format: 'sql' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/sql');
    expect(res.headers.get('Content-Disposition')).toContain('.sql');

    const body = await res.text();
    expect(body).toContain('BEGIN;');
    expect(exportToSQL).toHaveBeenCalledOnce();
  });

  // ── Date range filters ────────────────────────────────────────────────────

  it('should pass date range filters to export function', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: ORG_ID },
      error: null,
    });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({
      entityId: ENTITY_ID,
      startDate: '2025-01-01',
      endDate: '2025-03-31',
      status: 'posted',
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(exportToCSV).toHaveBeenCalledWith(
      mockDb,
      ENTITY_ID,
      { startDate: '2025-01-01', endDate: '2025-03-31', status: 'posted' },
    );
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('should return 500 when export throws', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: ORG_ID },
      error: null,
    });
    mockDb.from.mockReturnValue(entityChain);

    (exportToCSV as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('DB connection lost')
    );

    const req = createGetRequest({ entityId: ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to export journal entries');
  });
});
