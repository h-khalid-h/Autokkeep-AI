import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Sentry
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock AI analyst
const mockAnalyzeFinancialQuestion = vi.fn();
vi.mock('@/lib/ai/analyst', () => ({
  analyzeFinancialQuestion: (...args: unknown[]) => mockAnalyzeFinancialQuestion(...args),
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

const VALID_ENTITY_ID = 'a0000000-0000-4000-8000-000000000010';
const VALID_CONVERSATION_ID = 'a0000000-0000-4000-8000-000000000020';

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/ai/chat');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
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

const { GET, POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/ai/chat
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/ai/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ message: 'Hello', entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when message is missing', async () => {
    const req = createPostRequest({ entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 when entityId is missing', async () => {
    const req = createPostRequest({ message: 'Hello' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 when message is too long (over 2000 chars)', async () => {
    const longMessage = 'a'.repeat(2001);
    const req = createPostRequest({ message: longMessage, entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 403 when entity is not found or access denied', async () => {
    // Entity lookup returns null
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createPostRequest({ message: 'Hello', entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should create new conversation and return AI response', async () => {
    // Entity lookup succeeds
    const entityChain = createChainMock({
      data: { id: VALID_ENTITY_ID, org_id: mockAuthContext.membership.org_id },
      error: null,
    });
    // New conversation creation
    const convCreateChain = createChainMock({
      data: { id: VALID_CONVERSATION_ID },
      error: null,
    });
    // Message inserts and conversation update
    const insertChain = createChainMock({ data: null, error: null });
    const updateChain = createChainMock({ data: null, error: null });

    let fromCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'ai_conversations') {
        fromCallCount++;
        if (fromCallCount === 1) return convCreateChain; // create conversation
        return updateChain; // update timestamp
      }
      if (table === 'ai_conversation_messages') return insertChain;
      return createChainMock({ data: null, error: null });
    });

    // Mock AI response
    mockAnalyzeFinancialQuestion.mockResolvedValue({
      answer: 'Revenue increased 15% this quarter.',
      dataCitations: [{ metric: 'revenue', value: '+15%', period: 'Q4 2024' }],
      suggestedFollowUps: ['What drove the increase?'],
      confidence: 'high',
    });

    const req = createPostRequest({ message: 'How is revenue?', entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversationId).toBe(VALID_CONVERSATION_ID);
    expect(json.answer).toBe('Revenue increased 15% this quarter.');
    expect(json.dataCitations).toHaveLength(1);
    expect(json.suggestedFollowUps).toHaveLength(1);
    expect(json.confidence).toBe('high');
  });

  it('should return 500 when conversation creation fails', async () => {
    const entityChain = createChainMock({
      data: { id: VALID_ENTITY_ID, org_id: mockAuthContext.membership.org_id },
      error: null,
    });
    const convCreateChain = createChainMock({
      data: null,
      error: { message: 'Insert failed' },
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'ai_conversations') return convCreateChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ message: 'Hello', entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to create conversation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/ai/chat
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/ai/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest({ entityId: VALID_ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when entityId is missing', async () => {
    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('entityId is required');
  });

  it('should return 403 when entity is not found', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: VALID_ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return conversations list when no conversationId', async () => {
    const entityChain = createChainMock({
      data: { id: VALID_ENTITY_ID, org_id: mockAuthContext.membership.org_id },
      error: null,
    });
    const conversations = [
      { id: 'conv-1', title: 'Revenue Q4', created_at: '2024-01-01', updated_at: '2024-01-02' },
      { id: 'conv-2', title: 'Expenses', created_at: '2024-01-03', updated_at: '2024-01-04' },
    ];
    const convListChain = createChainMock({ data: conversations, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'ai_conversations') return convListChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: VALID_ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversations).toHaveLength(2);
  });

  it('should return 404 when conversation not found', async () => {
    const entityChain = createChainMock({
      data: { id: VALID_ENTITY_ID, org_id: mockAuthContext.membership.org_id },
      error: null,
    });
    const convLookupChain = createChainMock({ data: null, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'ai_conversations') return convLookupChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({
      entityId: VALID_ENTITY_ID,
      conversationId: VALID_CONVERSATION_ID,
    });
    const res = await GET(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Conversation not found');
  });

  it('should return messages for a valid conversation', async () => {
    const entityChain = createChainMock({
      data: { id: VALID_ENTITY_ID, org_id: mockAuthContext.membership.org_id },
      error: null,
    });
    const convChain = createChainMock({
      data: { id: VALID_CONVERSATION_ID },
      error: null,
    });
    const messages = [
      { id: 'msg-1', role: 'user', content: 'Hello', created_at: '2024-01-01' },
      { id: 'msg-2', role: 'assistant', content: 'Hi there!', created_at: '2024-01-01' },
    ];
    const msgChain = createChainMock({ data: messages, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'ai_conversations') return convChain;
      if (table === 'ai_conversation_messages') return msgChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({
      entityId: VALID_ENTITY_ID,
      conversationId: VALID_CONVERSATION_ID,
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversationId).toBe(VALID_CONVERSATION_ID);
    expect(json.messages).toHaveLength(2);
    expect(json.messages[0].role).toBe('user');
    expect(json.messages[1].role).toBe('assistant');
  });
});
