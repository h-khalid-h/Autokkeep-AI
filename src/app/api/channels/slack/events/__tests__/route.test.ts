import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockVerifySlackSignature = vi.fn();

vi.mock('@/lib/channels/slack', () => ({
  verifySlackSignature: mockVerifySlackSignature,
}));

const mockAdminDb = { from: vi.fn() };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminDb),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createSlackRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): NextRequest {
  const defaultHeaders = {
    'content-type': 'application/json',
    'x-slack-request-timestamp': '1234567890',
    'x-slack-signature': 'v0=valid_signature',
    ...headers,
  };

  return new NextRequest('http://localhost:3000/api/channels/slack/events', {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');

describe('POST /api/channels/slack/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLACK_SIGNING_SECRET = 'test-slack-secret';
    mockVerifySlackSignature.mockReturnValue(true);
  });

  it('should respond to url_verification challenge', async () => {
    const req = createSlackRequest({
      type: 'url_verification',
      challenge: 'test-challenge-token',
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.challenge).toBe('test-challenge-token');
  });

  it('should reject requests with invalid signature', async () => {
    mockVerifySlackSignature.mockReturnValue(false);

    const req = createSlackRequest({
      type: 'event_callback',
      event: { type: 'message', text: 'hello' },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Invalid signature');
  });

  it('should process event_callback with message file upload', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({
      data: { id: 'rr-1', transaction_id: 'tx-1' },
      error: null,
    });

    const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
    updateChain.update = vi.fn().mockReturnValue(updateChain);
    updateChain.eq = vi.fn().mockReturnValue(updateChain);
    updateChain.select = vi.fn().mockReturnValue(updateChain);
    updateChain.single = vi.fn().mockResolvedValue({
      data: { entity_id: 'entity-1' },
      error: null,
    });

    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'receipt_requests') return chain;
      if (table === 'transactions') return updateChain;
      return chain;
    });

    const req = createSlackRequest({
      type: 'event_callback',
      event: {
        type: 'message',
        user: 'U12345',
        thread_ts: '1234567890.123456',
        files: [
          { url_private: 'https://files.slack.com/receipt.pdf', mimetype: 'application/pdf', name: 'receipt.pdf' },
        ],
      },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('should handle unknown event types gracefully', async () => {
    const req = createSlackRequest({
      type: 'unknown_type',
      data: { foo: 'bar' },
    });

    const res = await POST(req);

    // Should still return 200 (Slack expects acknowledgement)
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('should handle event_callback with app_mention', async () => {
    const req = createSlackRequest({
      type: 'event_callback',
      event: {
        type: 'app_mention',
        text: '<@U0LAN0Z89> help',
        user: 'U12345',
        channel: 'C12345',
      },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('should return 500 when SLACK_SIGNING_SECRET is not configured', async () => {
    delete process.env.SLACK_SIGNING_SECRET;

    const req = createSlackRequest({
      type: 'url_verification',
      challenge: 'test',
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('configuration');
  });
});
