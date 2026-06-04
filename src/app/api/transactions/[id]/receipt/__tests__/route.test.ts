import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}));

const mockDb = {
  from: vi.fn(),
  storage: {
    from: vi.fn(),
  },
};

const mockAuthContext = {
  user: { id: 'user-1', email: 'user@example.com' },
  membership: { id: 'tm-1', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: ['entity-1'],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

const mockRouteContext = {
  params: Promise.resolve({ id: 'txn-1' }),
};

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

function createFormDataRequest(formFields: Record<string, string | File>): NextRequest {
  const formData = new FormData();
  for (const [key, value] of Object.entries(formFields)) {
    formData.append(key, value);
  }
  return new NextRequest('http://localhost:3000/api/transactions/txn-1/receipt', {
    method: 'POST',
    body: formData,
  });
}

function createMockFile(name: string, type: string, sizeBytes: number): File {
  const buffer = new ArrayBuffer(sizeBytes);
  return new File([buffer], name, { type });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('POST /api/transactions/[id]/receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const file = createMockFile('receipt.jpg', 'image/jpeg', 1024);
    const req = createFormDataRequest({ receipt: file });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── File type validation ──────────────────────────────────────────────────

  it('should reject unsupported file types (e.g. HTML)', async () => {
    const txChain = createChainMock({
      data: { id: 'txn-1', entity_id: 'entity-1', document_status: 'missing' },
      error: null,
    });
    mockDb.from.mockReturnValue(txChain);

    const file = createMockFile('malicious.html', 'text/html', 1024);
    const req = createFormDataRequest({ receipt: file });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Unsupported file type');
    expect(json.error).toContain('text/html');
  });

  // ── File size validation ──────────────────────────────────────────────────

  it('should reject files exceeding 10MB', async () => {
    const txChain = createChainMock({
      data: { id: 'txn-1', entity_id: 'entity-1', document_status: 'missing' },
      error: null,
    });
    mockDb.from.mockReturnValue(txChain);

    const file = createMockFile('large.jpg', 'image/jpeg', 11 * 1024 * 1024);
    const req = createFormDataRequest({ receipt: file });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('File too large');
  });

  // ── SSRF protection ───────────────────────────────────────────────────────

  it('should reject internal URLs (localhost) to prevent SSRF', async () => {
    const txChain = createChainMock({
      data: { id: 'txn-1', entity_id: 'entity-1', document_status: 'missing' },
      error: null,
    });
    mockDb.from.mockReturnValue(txChain);

    const req = createFormDataRequest({ receipt_url: 'https://localhost/admin/secrets' });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Internal URLs are not allowed');
  });

  it('should reject internal URLs (169.254.x.x metadata)', async () => {
    const txChain = createChainMock({
      data: { id: 'txn-1', entity_id: 'entity-1', document_status: 'missing' },
      error: null,
    });
    mockDb.from.mockReturnValue(txChain);

    const req = createFormDataRequest({ receipt_url: 'https://169.254.169.254/latest/meta-data' });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Internal URLs are not allowed');
  });

  it('should reject non-https receipt URLs', async () => {
    const txChain = createChainMock({
      data: { id: 'txn-1', entity_id: 'entity-1', document_status: 'missing' },
      error: null,
    });
    mockDb.from.mockReturnValue(txChain);

    const req = createFormDataRequest({ receipt_url: 'http://example.com/receipt.jpg' });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('https://');
  });

  // ── Successful upload ─────────────────────────────────────────────────────

  it('should upload a valid file successfully', async () => {
    const txChain = createChainMock({
      data: { id: 'txn-1', entity_id: 'entity-1', document_status: 'missing' },
      error: null,
    });
    const updateChain = createChainMock({ data: null, error: null });

    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'transactions') {
        txCallCount++;
        return txCallCount === 1 ? txChain : updateChain;
      }
      if (table === 'receipt_requests') return updateChain;
      return createChainMock({ data: null, error: null });
    });

    mockDb.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({
        data: { path: 'receipts/entity-1/txn-1/12345.jpg' },
        error: null,
      }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: 'https://storage.example.com/receipts/entity-1/txn-1/12345.jpg' },
      }),
    });

    const file = createMockFile('receipt.jpg', 'image/jpeg', 5000);
    const req = createFormDataRequest({ receipt: file });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.document_status).toBe('found');
    expect(json.document_url).toBeDefined();
  });

  it('should accept a valid URL-based receipt upload', async () => {
    const txChain = createChainMock({
      data: { id: 'txn-1', entity_id: 'entity-1', document_status: 'missing' },
      error: null,
    });
    const updateChain = createChainMock({ data: null, error: null });

    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'transactions') {
        txCallCount++;
        return txCallCount === 1 ? txChain : updateChain;
      }
      if (table === 'receipt_requests') return updateChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createFormDataRequest({
      receipt_url: 'https://cdn.whatsapp.net/receipt-12345.jpg',
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.document_status).toBe('found');
    expect(json.document_url).toBe('https://cdn.whatsapp.net/receipt-12345.jpg');
  });

  it('should return 404 when transaction not found', async () => {
    const txChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(txChain);

    const file = createMockFile('receipt.jpg', 'image/jpeg', 1024);
    const req = createFormDataRequest({ receipt: file });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Transaction not found');
  });

  it('should return 400 when no file or URL provided', async () => {
    const txChain = createChainMock({
      data: { id: 'txn-1', entity_id: 'entity-1', document_status: 'missing' },
      error: null,
    });
    mockDb.from.mockReturnValue(txChain);

    // Empty form data — no receipt or receipt_url
    const formData = new FormData();
    const req = new NextRequest('http://localhost:3000/api/transactions/txn-1/receipt', {
      method: 'POST',
      body: formData,
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('No receipt file or URL provided');
  });
});
