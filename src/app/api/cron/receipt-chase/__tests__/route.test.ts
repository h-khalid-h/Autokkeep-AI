import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  withSentryHandler: vi.fn((handler: unknown) => handler),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockRunReceiptChase = vi.fn();
vi.mock('@/lib/channels/chase-agent', () => ({
  runReceiptChase: (...args: unknown[]) => mockRunReceiptChase(...args),
}));

// ─── Supabase admin mock ────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
let mockConnectionsResult: { data: any; error: any } = { data: [], error: null };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            then: vi.fn((resolve: any) => resolve(mockConnectionsResult)),
          }),
        }),
      }),
    }),
  })),
}));
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createCronRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) {
    headers['authorization'] = `Bearer ${secret}`;
  }
  return new NextRequest('http://localhost:3000/api/cron/receipt-chase', {
    method: 'GET',
    headers,
  });
}

function makeChaseReport(entityId: string, overrides: Partial<{
  totalChased: number;
  skipped: number;
  errors: string[];
  byChannel: Record<string, number>;
}> = {}) {
  return {
    entityId,
    totalChased: overrides.totalChased ?? 0,
    skipped: overrides.skipped ?? 0,
    errors: overrides.errors ?? [],
    byChannel: overrides.byChannel ?? {},
    timestamp: new Date().toISOString(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../../receipt-chase/route');

describe('GET /api/cron/receipt-chase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    mockConnectionsResult = { data: [], error: null };
  });

  it('returns 401 without CRON_SECRET header', async () => {
    const req = createCronRequest();
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 with wrong CRON_SECRET', async () => {
    const req = createCronRequest('wrong-secret');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 200 with valid CRON_SECRET and no entities', async () => {
    mockConnectionsResult = { data: [], error: null };

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.chased).toBe(0);
    expect(json.entities).toBe(0);
    expect(json.message).toBe('No active bank connections found');
  });

  it('returns 200 with null connections', async () => {
    mockConnectionsResult = { data: null, error: null };

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.chased).toBe(0);
  });

  it('processes entities concurrently and aggregates results', async () => {
    // Two connections for entity-1, one for entity-2 (entity-1 is deduplicated)
    mockConnectionsResult = {
      data: [
        { entity_id: 'entity-1' },
        { entity_id: 'entity-1' },
        { entity_id: 'entity-2' },
      ],
      error: null,
    };

    mockRunReceiptChase
      .mockResolvedValueOnce(
        makeChaseReport('entity-1', {
          totalChased: 3,
          skipped: 1,
          byChannel: { sms: 2, whatsapp: 1 },
        })
      )
      .mockResolvedValueOnce(
        makeChaseReport('entity-2', {
          totalChased: 2,
          skipped: 0,
          byChannel: { sms: 1, slack: 1 },
        })
      );

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    // Entity-1 appears twice but is deduplicated → 2 unique entities
    expect(json.entities).toBe(2);
    expect(json.totalChased).toBe(5); // 3 + 2
    expect(json.totalSkipped).toBe(1); // 1 + 0
    expect(json.byChannel).toEqual({ sms: 3, whatsapp: 1, slack: 1 });
    expect(json.success).toBe(true);

    // runReceiptChase should be called exactly 2 times (once per unique entity)
    expect(mockRunReceiptChase).toHaveBeenCalledTimes(2);
  });

  it('handles partial failures when some entities fail', async () => {
    mockConnectionsResult = {
      data: [
        { entity_id: 'entity-ok' },
        { entity_id: 'entity-fail' },
      ],
      error: null,
    };

    mockRunReceiptChase
      .mockResolvedValueOnce(
        makeChaseReport('entity-ok', { totalChased: 2, byChannel: { sms: 2 } })
      )
      .mockRejectedValueOnce(new Error('Chase agent crashed'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.entities).toBe(2);
    expect(json.totalChased).toBe(2);
    expect(json.totalErrors).toBe(1); // one entity-level error
    expect(json.entityErrors).toHaveLength(1);
    expect(json.entityErrors[0].entityId).toBe('entity-fail');
    expect(json.entityErrors[0].error).toBe('Chase agent crashed');

    consoleSpy.mockRestore();
  });
});
