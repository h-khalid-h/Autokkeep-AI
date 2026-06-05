import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

const mockParseTeamsWebhookPayload = vi.fn();
const mockMapTeamsChoiceToGL = vi.fn();
const mockSendTeamsConfirmation = vi.fn();
vi.mock('@/lib/channels/teams', () => ({
  parseTeamsWebhookPayload: (...args: unknown[]) => mockParseTeamsWebhookPayload(...args),
  mapTeamsChoiceToGL: (...args: unknown[]) => mockMapTeamsChoiceToGL(...args),
  sendTeamsConfirmation: (...args: unknown[]) => mockSendTeamsConfirmation(...args),
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
  chain.in = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

function createPostRequest(body: Record<string, unknown>, secret?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['x-teams-secret'] = secret;
  return new NextRequest('http://localhost:3000/api/channels/teams/webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');

describe('POST /api/channels/teams/webhook', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TEAMS_WEBHOOK_SECRET = 'test-secret';
    process.env.TEAMS_WEBHOOK_URL = 'https://teams.webhook.url';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return 500 when TEAMS_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.TEAMS_WEBHOOK_SECRET;
    const req = createPostRequest({}, 'test-secret');
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Server configuration error');
  });

  it('should return 401 when x-teams-secret header is missing', async () => {
    const req = createPostRequest({});
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Missing webhook secret');
  });

  it('should return 401 when secret does not match', async () => {
    const req = createPostRequest({}, 'wrong-secret');
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when payload is invalid', async () => {
    mockParseTeamsWebhookPayload.mockReturnValue(null);
    const req = createPostRequest({ garbage: true }, 'test-secret');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid payload');
  });

  it('should return 403 when transaction entity validation fails', async () => {
    mockParseTeamsWebhookPayload.mockReturnValue({
      transactionId: 'txn-1',
      categoryChoice: 'personal',
      action: 'categorize',
    });

    const txChain = createChainMock({ data: null, error: null });
    mockAdminDb.from.mockReturnValue(txChain);

    const req = createPostRequest({ action: 'categorize' }, 'test-secret');
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('should handle personal categorization', async () => {
    mockParseTeamsWebhookPayload.mockReturnValue({
      transactionId: 'txn-1',
      categoryChoice: 'personal',
      action: 'categorize',
    });

    const txChain = createChainMock({ data: { entity_id: 'ent-1' }, error: null });
    const connChain = createChainMock({ data: [{ id: 'conn-1' }], error: null });
    const updateChain = createChainMock({ data: null, error: null });
    mockAdminDb.from
      .mockReturnValueOnce(txChain)    // transactions select
      .mockReturnValueOnce(connChain)  // channel_connections check
      .mockReturnValueOnce(updateChain) // transactions update
      .mockReturnValueOnce(updateChain); // audit_logs insert
    mockSendTeamsConfirmation.mockResolvedValue(undefined);

    const req = createPostRequest({}, 'test-secret');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('should return 500 on exception', async () => {
    mockParseTeamsWebhookPayload.mockImplementation(() => { throw new Error('boom'); });
    // Need valid secret to get past auth
    const req = createPostRequest({}, 'test-secret');
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal error');
  });
});
