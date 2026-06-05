import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock Sentry
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  withSentryHandler: vi.fn((handler: unknown) => handler),
}));

// Mock the extracted service module
const mockRunAutoCategorize = vi.fn();
vi.mock('@/lib/ai/auto-categorize', () => ({
  runAutoCategorize: (...args: unknown[]) => mockRunAutoCategorize(...args),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/auto-categorize', {
    method: 'POST',
    headers,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');

describe('POST /api/cron/auto-categorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 without authorization header', async () => {
    const req = createRequest();
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 401 with wrong CRON_SECRET', async () => {
    const req = createRequest({ authorization: 'Bearer wrong-secret' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 401 when CRON_SECRET env is not set', async () => {
    delete process.env.CRON_SECRET;

    const req = createRequest({ authorization: 'Bearer something' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── No transactions to process ────────────────────────────────────────────

  it('should return 200 with 0 processed when no uncategorized transactions', async () => {
    mockRunAutoCategorize.mockResolvedValue({
      processed: 0,
      auto_categorized: 0,
      human_review: 0,
      failed: 0,
      entity_ids: [],
    });

    const req = createRequest({ authorization: 'Bearer test-cron-secret' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(mockRunAutoCategorize).toHaveBeenCalledOnce();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('should process uncategorized transactions with valid secret', async () => {
    mockRunAutoCategorize.mockResolvedValue({
      processed: 2,
      auto_categorized: 1,
      human_review: 1,
      failed: 0,
      entity_ids: ['entity-1'],
    });

    const req = createRequest({ authorization: 'Bearer test-cron-secret' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(2);
    expect(json.auto_categorized).toBe(1);
    expect(json.human_review).toBe(1);
  });

  // ── Service error ─────────────────────────────────────────────────────────

  it('should return 500 on service error', async () => {
    mockRunAutoCategorize.mockRejectedValue(new Error('DB connection failed'));

    const req = createRequest({ authorization: 'Bearer test-cron-secret' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Auto-categorization cron failed');
  });
});
