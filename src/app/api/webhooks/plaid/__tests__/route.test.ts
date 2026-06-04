import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockIngestTransactions = vi.fn();
vi.mock('@/lib/plaid/ingest', () => ({
  ingestTransactions: (...args: unknown[]) => mockIngestTransactions(...args),
}));

const mockRunAutoCategorize = vi.fn();
vi.mock('@/lib/ai/auto-categorize', () => ({
  runAutoCategorize: (...args: unknown[]) => mockRunAutoCategorize(...args),
}));

// Mock jose — we skip real JWT verification by setting PLAID_SKIP_WEBHOOK_VERIFICATION
vi.mock('jose', () => ({
  importJWK: vi.fn(),
  jwtVerify: vi.fn(),
  decodeProtectedHeader: vi.fn(),
}));

// ─── Supabase admin mock ────────────────────────────────────────────────────────

let connectionResult: { data: unknown; error: unknown } = { data: null, error: null };

const mockUpdateReturn = {
  eq: vi.fn().mockResolvedValue({ error: null }),
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockImplementation(() => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockReturnValue({
        then: vi.fn((resolve: (v: unknown) => void) => resolve(connectionResult)),
      });
      chain.update = vi.fn().mockReturnValue(mockUpdateReturn);
      return chain;
    }),
  })),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createWebhookRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/webhooks/plaid', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const mockConnection = {
  id: 'conn-1',
  entity_id: 'entity-1',
  plaid_item_id: 'item-1',
  plaid_access_token: 'access-sandbox-test',
  cursor: null,
  institution_name: 'Chase',
  status: 'active',
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../../plaid/route');

describe('POST /api/webhooks/plaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PLAID_SKIP_WEBHOOK_VERIFICATION', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    connectionResult = { data: mockConnection, error: null };
  });

  it('rejects invalid JSON body', async () => {
    const req = createWebhookRequest('not-valid-json{{{');
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid JSON');
  });

  it('rejects missing webhook payload fields when verification is skipped', async () => {
    const req = createWebhookRequest({ webhook_type: 'TRANSACTIONS' });
    // Missing webhook_code and item_id
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid webhook payload structure');
  });

  it('rejects missing Plaid-Verification header when verification is not skipped', async () => {
    vi.stubEnv('PLAID_SKIP_WEBHOOK_VERIFICATION', '');

    const req = createWebhookRequest({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-1',
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Missing verification header');
  });

  it('handles TRANSACTIONS.SYNC_UPDATES_AVAILABLE event', async () => {
    mockIngestTransactions.mockResolvedValue({ added: 5, modified: 1, removed: 0 });
    mockRunAutoCategorize.mockResolvedValue(undefined);

    const req = createWebhookRequest({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-1',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(mockIngestTransactions).toHaveBeenCalledTimes(1);
  });

  it('handles TRANSACTIONS.DEFAULT_UPDATE event', async () => {
    mockIngestTransactions.mockResolvedValue({ added: 3, modified: 0, removed: 0 });
    mockRunAutoCategorize.mockResolvedValue(undefined);

    const req = createWebhookRequest({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'DEFAULT_UPDATE',
      item_id: 'item-1',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(mockIngestTransactions).toHaveBeenCalledTimes(1);
  });

  it('triggers auto-categorize when new transactions are added', async () => {
    mockIngestTransactions.mockResolvedValue({ added: 2, modified: 0, removed: 0 });
    mockRunAutoCategorize.mockResolvedValue(undefined);

    const req = createWebhookRequest({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-1',
    });
    await POST(req);

    // runAutoCategorize is fire-and-forget, but should be called
    expect(mockRunAutoCategorize).toHaveBeenCalledTimes(1);
  });

  it('does not trigger auto-categorize when no new transactions', async () => {
    mockIngestTransactions.mockResolvedValue({ added: 0, modified: 2, removed: 0 });

    const req = createWebhookRequest({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-1',
    });
    await POST(req);

    expect(mockRunAutoCategorize).not.toHaveBeenCalled();
  });

  it('handles unknown event types gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const req = createWebhookRequest({
      webhook_type: 'UNKNOWN',
      webhook_code: 'SOMETHING_NEW',
      item_id: 'item-1',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);

    consoleSpy.mockRestore();
  });

  it('returns 200 when connection is not found', async () => {
    connectionResult = { data: null, error: { code: 'PGRST116', message: 'Not found' } };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = createWebhookRequest({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'unknown-item',
    });
    const res = await POST(req);

    // Webhooks always return 200 to acknowledge receipt
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(mockIngestTransactions).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('handles ITEM.ERROR event', async () => {
    const req = createWebhookRequest({
      webhook_type: 'ITEM',
      webhook_code: 'ERROR',
      item_id: 'item-1',
      error: {
        error_type: 'ITEM_ERROR',
        error_code: 'ITEM_LOGIN_REQUIRED',
        error_message: 'The login details for this item have changed.',
      },
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);

    consoleSpy.mockRestore();
  });

  it('handles sync failure gracefully without crashing', async () => {
    mockIngestTransactions.mockRejectedValue(new Error('Plaid API timeout'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = createWebhookRequest({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-1',
    });
    const res = await POST(req);

    // Should still return 200 because error is caught per-event
    expect(res.status).toBe(200);

    consoleSpy.mockRestore();
  });
});
