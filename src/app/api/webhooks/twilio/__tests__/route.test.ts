import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockValidateTwilioSignature = vi.fn();

vi.mock('@/lib/channels/twilio', () => ({
  validateTwilioSignature: mockValidateTwilioSignature,
}));

const mockAdminDb = { from: vi.fn() };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminDb),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createTwilioRequest(
  params: Record<string, string>,
  headers: Record<string, string> = {},
): NextRequest {
  const body = new URLSearchParams(params).toString();
  return new NextRequest('http://localhost:3000/api/webhooks/twilio', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': 'valid-sig',
      ...headers,
    },
    body,
  });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');

describe('POST /api/webhooks/twilio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.autokkeep.com';
    mockValidateTwilioSignature.mockReturnValue(true);
  });

  it('should reject requests with invalid signature', async () => {
    mockValidateTwilioSignature.mockReturnValue(false);

    const req = createTwilioRequest({
      MessageSid: 'SM123',
      MessageStatus: 'delivered',
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain('Invalid signature');
  });

  it('should process delivered message status', async () => {
    const chain = createChainMock({ data: null, error: null });
    mockAdminDb.from.mockReturnValue(chain);

    const req = createTwilioRequest({
      MessageSid: 'SM123',
      MessageStatus: 'delivered',
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockAdminDb.from).toHaveBeenCalledWith('receipt_requests');
    // Verify that update was called with 'sent' status for delivered messages
    expect(chain.update).toHaveBeenCalledWith({ status: 'sent' });
  });

  it('should process failed message status', async () => {
    const chain = createChainMock({ data: null, error: null });
    mockAdminDb.from.mockReturnValue(chain);

    const req = createTwilioRequest({
      MessageSid: 'SM456',
      MessageStatus: 'failed',
      ErrorCode: '30001',
      ErrorMessage: 'Queue overflow',
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ status: 'failed' });
  });

  it('should return 500 when TWILIO_AUTH_TOKEN is not configured', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;

    const req = createTwilioRequest({
      MessageSid: 'SM789',
      MessageStatus: 'delivered',
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain('not configured');
  });

  it('should return 200 even when processing throws (prevent retries)', async () => {
    // Simulate an error during processing by making db throw
    mockAdminDb.from.mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const req = createTwilioRequest({
      MessageSid: 'SM999',
      MessageStatus: 'delivered',
    });

    const res = await POST(req);

    // Twilio webhooks should always return 200 to prevent retries
    expect(res.status).toBe(200);
  });

  it('should handle read status same as delivered', async () => {
    const chain = createChainMock({ data: null, error: null });
    mockAdminDb.from.mockReturnValue(chain);

    const req = createTwilioRequest({
      MessageSid: 'SM111',
      MessageStatus: 'read',
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith({ status: 'sent' });
  });
});
