import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

const mockValidateTwilioSignature = vi.fn();
const mockParseTwilioWebhook = vi.fn();
const mockParseUserResponse = vi.fn();
vi.mock('@/lib/channels/twilio', () => ({
  validateTwilioSignature: (...args: unknown[]) => mockValidateTwilioSignature(...args),
  parseTwilioWebhook: (...args: unknown[]) => mockParseTwilioWebhook(...args),
  parseUserResponse: (...args: unknown[]) => mockParseUserResponse(...args),
  extractTransactionRef: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockAdminDb = { from: vi.fn() };
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminDb),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

function createSmsRequest(body: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/channels/sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': 'test-signature',
    },
    body,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');

describe('POST /api/channels/sms', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return 500 when TWILIO_AUTH_TOKEN is missing', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const req = createSmsRequest('Body=hello&From=%2B1234567890');
    const res = await POST(req);
    expect(res!.status).toBe(500);
    const text = await res!.text();
    expect(text).toBe('Server configuration error');
  });

  it('should return 401 for invalid Twilio signature', async () => {
    mockValidateTwilioSignature.mockReturnValue(false);
    const req = createSmsRequest('Body=hello&From=%2B1234567890');
    const res = await POST(req);
    expect(res!.status).toBe(401);
    const text = await res!.text();
    expect(text).toBe('Invalid signature');
  });

  it('should handle opt-out keyword (stop)', async () => {
    mockValidateTwilioSignature.mockReturnValue(true);
    mockParseTwilioWebhook.mockReturnValue({ body: 'stop', from: '+1234567890' });
    mockParseUserResponse.mockReturnValue({ type: 'unknown', mediaUrls: [] });

    const requestChain = createChainMock({ data: null, error: null });
    const upsertChain = createChainMock({ data: null, error: null });
    mockAdminDb.from.mockReturnValueOnce(requestChain).mockReturnValueOnce(upsertChain);

    const req = createSmsRequest('Body=stop&From=%2B1234567890');
    const res = await POST(req);
    expect(res!.status).toBe(200);
    expect(res!.headers.get('content-type')).toBe('application/xml');
    const text = await res!.text();
    expect(text).toContain('unsubscribed');
  });

  it('should handle opt-in keyword (start)', async () => {
    mockValidateTwilioSignature.mockReturnValue(true);
    mockParseTwilioWebhook.mockReturnValue({ body: 'start', from: '+1234567890' });
    mockParseUserResponse.mockReturnValue({ type: 'unknown', mediaUrls: [] });

    const updateChain = createChainMock({ data: null, error: null });
    mockAdminDb.from.mockReturnValue(updateChain);

    const req = createSmsRequest('Body=start&From=%2B1234567890');
    const res = await POST(req);
    expect(res!.status).toBe(200);
    const text = await res!.text();
    expect(text).toContain('Welcome back');
  });

  it('should return help text when no pending receipt request', async () => {
    mockValidateTwilioSignature.mockReturnValue(true);
    mockParseTwilioWebhook.mockReturnValue({ body: 'hello', from: '+1234567890' });
    mockParseUserResponse.mockReturnValue({ type: 'unknown', mediaUrls: [] });

    const receiptChain = createChainMock({ data: null, error: { code: 'PGRST116' } });
    mockAdminDb.from.mockReturnValue(receiptChain);

    const req = createSmsRequest('Body=hello&From=%2B1234567890');
    const res = await POST(req);
    expect(res!.status).toBe(200);
    const text = await res!.text();
    expect(text).toContain("don't have a pending receipt request");
  });

  it('should handle business response', async () => {
    mockValidateTwilioSignature.mockReturnValue(true);
    mockParseTwilioWebhook.mockReturnValue({ body: 'business', from: '+1234567890' });
    mockParseUserResponse.mockReturnValue({ type: 'business', mediaUrls: [] });

    const receiptChain = createChainMock({ data: { id: 'rr-1', transaction_id: 'txn-1' }, error: null });
    const txChain = createChainMock({ data: { entity_id: 'ent-1', category_ai: 'office' }, error: null });
    const updateChain = createChainMock({ data: null, error: null });
    mockAdminDb.from
      .mockReturnValueOnce(receiptChain)
      .mockReturnValueOnce(txChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(updateChain);

    const req = createSmsRequest('Body=business&From=%2B1234567890');
    const res = await POST(req);
    expect(res!.status).toBe(200);
    const text = await res!.text();
    expect(text).toContain('business expense');
  });

  it('should return error TwiML on exception', async () => {
    mockValidateTwilioSignature.mockReturnValue(true);
    mockParseTwilioWebhook.mockImplementation(() => { throw new Error('parse error'); });

    const req = createSmsRequest('Body=test&From=%2B1234567890');
    const res = await POST(req);
    expect(res!.status).toBe(200);
    const text = await res!.text();
    expect(text).toContain('something went wrong');
  });
});
