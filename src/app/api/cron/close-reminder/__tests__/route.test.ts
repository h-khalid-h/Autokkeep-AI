import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  withSentryHandler: vi.fn((handler: unknown) => handler),
}));

const mockAdminDb = { from: vi.fn() };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminDb),
}));

const mockDispatchWithFallback = vi.fn().mockResolvedValue({ success: true, channel: 'email' });

vi.mock('@/lib/channels/dispatcher', () => ({
  dispatchWithFallback: mockDispatchWithFallback,
}));

vi.mock('@/lib/notifications/close-reminder', () => ({
  buildCloseReminderSlackBlocks: vi.fn().mockReturnValue([{ type: 'section', text: 'reminder' }]),
  buildCloseReminderSMS: vi.fn().mockReturnValue('SMS reminder text'),
  buildCloseReminderEmailHtml: vi.fn().mockReturnValue('<p>Email reminder</p>'),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

const CRON_SECRET = 'test-cron-secret-123';

function createCronRequest(overrides?: { authorization?: string }): NextRequest {
  const headers: Record<string, string> = {
    authorization: overrides?.authorization ?? `Bearer ${CRON_SECRET}`,
  };
  return new NextRequest('http://localhost:3000/api/cron/close-reminder', {
    method: 'POST',
    headers,
  });
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
  chain.lt = vi.fn().mockReturnValue(chain);
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

const { POST } = await import('../route');

describe('POST /api/cron/close-reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set the CRON_SECRET env var
    process.env.CRON_SECRET = CRON_SECRET;
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('should return 401 without CRON_SECRET header', async () => {
    const req = createCronRequest({ authorization: '' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 401 with wrong CRON_SECRET', async () => {
    const req = createCronRequest({ authorization: 'Bearer wrong-secret' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 401 when CRON_SECRET env is not set', async () => {
    delete process.env.CRON_SECRET;

    const req = createCronRequest();
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  // ── Valid CRON_SECRET ──────────────────────────────────────────────────────

  it('should return 200 with valid CRON_SECRET and no entities', async () => {
    const entityChain = createChainMock({ data: [], error: null });
    mockAdminDb.from.mockReturnValue(entityChain);

    const req = createCronRequest();
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.processed).toBe(0);
    expect(json.notified).toBe(0);
    expect(json.message).toBe('No entities with unlocked periods');
  });

  // ── No entities / null ────────────────────────────────────────────────────

  it('should handle null entities result', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockAdminDb.from.mockReturnValue(entityChain);

    const req = createCronRequest();
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.processed).toBe(0);
  });

  // ── Entity fetch failure ──────────────────────────────────────────────────

  it('should return 500 when entity fetch fails', async () => {
    const entityChain = createChainMock({ data: null, error: { message: 'DB error' } });
    mockAdminDb.from.mockReturnValue(entityChain);

    const req = createCronRequest();
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch entities');
  });

  // ── Processing entities with high readiness (>= 80) ──────────────────────

  it('should skip notification for entities with readiness >= 80', async () => {
    // Entity with 100% readiness (no transactions in period = score 100)
    const entities = [
      { id: 'ent-1', name: 'High Score LLC', org_id: 'org-1', current_period: '2025-06', period_locked: false },
    ];

    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'entities') {
        return createChainMock({ data: entities, error: null });
      }
      if (table === 'transactions') {
        // No transactions = 100% readiness
        return createChainMock({ data: [], error: null });
      }
      if (table === 'audit_log') {
        return createChainMock({ data: null, error: null });
      }
      return createChainMock({ data: [], error: null });
    });

    const req = createCronRequest();
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.processed).toBe(1);
    expect(json.notified).toBe(0);
    // dispatchWithFallback should NOT have been called
    expect(mockDispatchWithFallback).not.toHaveBeenCalled();
  });

  // ── Batch-fetches channel connections ─────────────────────────────────────

  it('should batch-fetch channel connections for admins when readiness < 80', async () => {
    const entities = [
      { id: 'ent-1', name: 'Low Score LLC', org_id: 'org-1', current_period: '2025-06', period_locked: false },
    ];

    // Transactions with issues — all uncategorized, missing receipts
    const transactions = [
      { id: 'tx-1', status: 'pending', document_status: 'missing', gl_code: null },
      { id: 'tx-2', status: 'human_review', document_status: null, gl_code: null },
    ];

    const teamMembers = [
      { user_id: 'user-1', role: 'admin' },
      { user_id: 'user-2', role: 'owner' },
    ];

    const channelConnections = [
      { user_id: 'user-1', channel_type: 'email', channel_id: 'user1@test.com', access_token: null, webhook_url: null },
      { user_id: 'user-2', channel_type: 'slack', channel_id: 'C12345', access_token: 'xoxb-token', webhook_url: null },
    ];

    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'entities') {
        return createChainMock({ data: entities, error: null });
      }
      if (table === 'transactions') {
        return createChainMock({ data: transactions, error: null });
      }
      if (table === 'team_members') {
        return createChainMock({ data: teamMembers, error: null });
      }
      if (table === 'channel_connections') {
        return createChainMock({ data: channelConnections, error: null });
      }
      if (table === 'audit_log') {
        return createChainMock({ data: null, error: null });
      }
      return createChainMock({ data: [], error: null });
    });

    const req = createCronRequest();
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.processed).toBe(1);
    expect(json.notified).toBe(1);
    expect(json.belowThreshold).toBe(1);

    // dispatchWithFallback called once per admin with connections
    expect(mockDispatchWithFallback).toHaveBeenCalledTimes(2);
  });

  // ── Entities without current_period are skipped ───────────────────────────

  it('should skip entities without current_period', async () => {
    const entities = [
      { id: 'ent-1', name: 'No Period LLC', org_id: 'org-1', current_period: null, period_locked: false },
    ];

    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'entities') {
        return createChainMock({ data: entities, error: null });
      }
      if (table === 'audit_log') {
        return createChainMock({ data: null, error: null });
      }
      return createChainMock({ data: [], error: null });
    });

    const req = createCronRequest();
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.processed).toBe(0); // skipped because no current_period
  });

  // ── Handles no admin users ────────────────────────────────────────────────

  it('should handle entity with no admin users gracefully', async () => {
    const entities = [
      { id: 'ent-1', name: 'No Admins LLC', org_id: 'org-1', current_period: '2025-06', period_locked: false },
    ];

    const transactions = [
      { id: 'tx-1', status: 'pending', document_status: 'missing', gl_code: null },
    ];

    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'entities') {
        return createChainMock({ data: entities, error: null });
      }
      if (table === 'transactions') {
        return createChainMock({ data: transactions, error: null });
      }
      if (table === 'team_members') {
        return createChainMock({ data: [], error: null });
      }
      if (table === 'audit_log') {
        return createChainMock({ data: null, error: null });
      }
      return createChainMock({ data: [], error: null });
    });

    const req = createCronRequest();
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results[0].notified).toBe(false);
    expect(json.results[0].error).toBe('No admin users found');
  });
});
