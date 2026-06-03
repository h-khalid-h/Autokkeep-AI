import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/plaid/client', () => ({
  removeItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/crypto', () => ({
  decryptToken: vi.fn((t: string) => `decrypted_${t}`),
}));

vi.mock('@/lib/validation', () => ({
  parseBody: vi.fn(),
  schemas: { plaidDisconnect: {} },
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
  return new NextRequest('http://localhost:3000/api/plaid/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
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
const { removeItem } = await import('@/lib/plaid/client');

describe('POST /api/plaid/disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ connectionId: 'a0000000-0000-4000-8000-000000000020' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for validation failure', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: NextResponse.json(
        { error: 'Validation failed', details: [{ field: 'connectionId', message: 'Required' }] },
        { status: 400 },
      ),
    });

    const req = createPostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 404 when connection not found', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { connectionId: 'a0000000-0000-4000-8000-000000000099' },
    });

    const connectionChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(connectionChain);

    const req = createPostRequest({ connectionId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Connection not found or access denied');
  });

  it('should return 404 when connection belongs to different org', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { connectionId: 'a0000000-0000-4000-8000-000000000020' },
    });

    const connectionChain = createChainMock({
      data: {
        id: 'a0000000-0000-4000-8000-000000000020',
        entity_id: 'a0000000-0000-4000-8000-000000000010',
        plaid_access_token: 'encrypted-token',
        institution_name: 'Test Bank',
        entity: { org_id: 'a0000000-0000-4000-8000-000000000999' }, // different org
      },
      error: null,
    });
    mockDb.from.mockReturnValue(connectionChain);

    const req = createPostRequest({ connectionId: 'a0000000-0000-4000-8000-000000000020' });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Connection not found or access denied');
  });

  it('should disconnect successfully (happy path)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { connectionId: 'a0000000-0000-4000-8000-000000000020' },
    });

    const connectionChain = createChainMock({
      data: {
        id: 'a0000000-0000-4000-8000-000000000020',
        entity_id: 'a0000000-0000-4000-8000-000000000010',
        plaid_access_token: 'encrypted-token',
        institution_name: 'Test Bank',
        entity: { org_id: 'a0000000-0000-4000-8000-000000000003' }, // same org
      },
      error: null,
    });

    const updateChain = createChainMock({ data: null, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'bank_connections') {
        // First call is select, second call is update
        return connectionChain;
      }
      return createChainMock({ data: null, error: null });
    });

    // Override to return updateChain on second call
    let callCount = 0;
    mockDb.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return connectionChain;
      return updateChain;
    });

    const req = createPostRequest({ connectionId: 'a0000000-0000-4000-8000-000000000020' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(removeItem).toHaveBeenCalledWith('decrypted_encrypted-token');
  });

  it('should still succeed when Plaid removeItem fails (non-fatal)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { connectionId: 'a0000000-0000-4000-8000-000000000020' },
    });

    (removeItem as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Plaid API error'));

    const connectionChain = createChainMock({
      data: {
        id: 'a0000000-0000-4000-8000-000000000020',
        entity_id: 'a0000000-0000-4000-8000-000000000010',
        plaid_access_token: 'encrypted-token',
        institution_name: 'Test Bank',
        entity: { org_id: 'a0000000-0000-4000-8000-000000000003' },
      },
      error: null,
    });

    const updateChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockDb.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return connectionChain;
      return updateChain;
    });

    const req = createPostRequest({ connectionId: 'a0000000-0000-4000-8000-000000000020' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
