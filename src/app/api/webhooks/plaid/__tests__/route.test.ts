import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock Sentry
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

// Mock audit log
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock jose — skip JWT verification (we test at the route level)
vi.mock('jose', () => ({
  importJWK: vi.fn(),
  jwtVerify: vi.fn(),
  decodeProtectedHeader: vi.fn(),
}));

// Mock ingestTransactions
const mockIngestTransactions = vi.fn().mockResolvedValue({ added: 5, modified: 0, removed: 0 });
vi.mock('@/lib/plaid/ingest', () => ({
  ingestTransactions: mockIngestTransactions,
}));

// Mock Supabase admin client
const mockFrom = vi.fn();
const mockAdminSupabase = { from: mockFrom };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminSupabase),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('http://localhost:3000/api/webhooks/plaid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  // When the chain is awaited directly (no .single()), return the resolved value
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

const mockConnection = {
  id: 'conn-1',
  entity_id: 'entity-1',
  plaid_item_id: 'item-1',
  plaid_access_token: 'access-sandbox-xxx',
  cursor: null,
  institution_name: 'Chase',
  status: 'connected',
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');

describe('POST /api/webhooks/plaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Skip webhook verification in tests (non-production)
    vi.stubEnv('PLAID_SKIP_WEBHOOK_VERIFICATION', 'true');
    vi.stubEnv('NODE_ENV', 'test');
  });

  // ── Missing verification header (when verification is NOT skipped) ────────

  it('should return 401 if verification header is missing and verification not skipped', async () => {
    // Enable verification
    vi.stubEnv('PLAID_SKIP_WEBHOOK_VERIFICATION', '');
    vi.stubEnv('NODE_ENV', 'test');

    const req = createRequest({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-1',
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Missing verification');
  });

  // ── Invalid payload structure ─────────────────────────────────────────────

  it('should return 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/webhooks/plaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid JSON');
  });

  // ── TRANSACTIONS webhook ──────────────────────────────────────────────────

  it('should handle TRANSACTIONS.SYNC_UPDATES_AVAILABLE webhook', async () => {
    const connectionChain = createChainMock({ data: mockConnection, error: null });
    const auditChain = createChainMock({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bank_connections') return connectionChain;
      if (table === 'audit_log') return auditChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createRequest({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-1',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);

    // Verify ingestTransactions was called
    expect(mockIngestTransactions).toHaveBeenCalled();
  });

  // ── ITEM.ERROR webhook ────────────────────────────────────────────────────

  it('should handle ITEM.ERROR webhook and update connection status', async () => {
    const connectionChain = createChainMock({ data: mockConnection, error: null });
    const _updateChain = createChainMock({ data: null, error: null });
    const auditChain = createChainMock({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bank_connections') {
        // First call: select (lookup), subsequent: update
        return connectionChain;
      }
      if (table === 'audit_log') return auditChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createRequest({
      webhook_type: 'ITEM',
      webhook_code: 'ERROR',
      item_id: 'item-1',
      error: {
        error_type: 'ITEM_ERROR',
        error_code: 'ITEM_LOGIN_REQUIRED',
        error_message: 'Login required',
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });

  // ── Unknown item_id ───────────────────────────────────────────────────────

  it('should return 200 even when no connection found for item_id', async () => {
    const connectionChain = createChainMock({ data: null, error: { code: 'PGRST116' } });
    mockFrom.mockReturnValue(connectionChain);

    const req = createRequest({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'unknown-item',
    });
    const res = await POST(req);

    // Plaid webhooks always return 200 to prevent retries
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });
});
