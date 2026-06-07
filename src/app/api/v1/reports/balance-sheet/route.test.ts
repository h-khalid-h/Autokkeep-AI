import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Mocks ───────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/public-api-auth', () => ({
  validateApiKey: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/lib/api-helpers', () => ({
  handleApiError: vi.fn(() =>
    NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  ),
}));

vi.mock('@/lib/reports/balance-sheet', () => ({
  generateBalanceSheet: vi.fn(),
}));

// ── Imports ─────────────────────────────────────────────────────────────────────

import { GET } from './route';
import { validateApiKey } from '@/lib/api/public-api-auth';
import { createServerClient } from '@/lib/supabase/server';
import { generateBalanceSheet } from '@/lib/reports/balance-sheet';

// ── Helpers ─────────────────────────────────────────────────────────────────────

function createRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => Promise.resolve(resolvedValue).then(resolve));
  return chain;
}

const MOCK_CTX = { orgId: 'org-123', apiKeyId: 'key-1', permissions: ['read:all'] };

const MOCK_BS_REPORT = {
  entityName: 'Test Corp',
  entityCurrency: 'USD',
  asOfDate: '2025-06-30',
  generatedAt: '2025-07-01T12:00:00Z',
  assets: [{ code: '1000', name: 'Cash', amount: 100000, type: 'asset' as const }],
  totalAssets: 100000,
  liabilities: [] as { code: string; name: string; amount: number; type: 'liability' }[],
  totalLiabilities: 0,
  equity: [] as { code: string; name: string; amount: number; type: 'equity' }[],
  totalEquity: 0,
  isBalanced: true,
  retainedEarnings: 100000,
};

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('GET /api/v1/reports/balance-sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 without API key', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(
      NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    );

    const req = createRequest('/api/v1/reports/balance-sheet');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('should return 400 when entityId is missing', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const req = createRequest('/api/v1/reports/balance-sheet?asOfDate=2025-06-30');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('entityId');
  });

  it('should return 400 when asOfDate is missing', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const req = createRequest('/api/v1/reports/balance-sheet?entityId=ent-1');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('asOfDate');
  });

  it('should return 403 when entity does not belong to org', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const entityChain = createChainMock({ data: null, error: { message: 'Not found' } });

    vi.mocked(createServerClient).mockResolvedValue({
      from: vi.fn(() => entityChain),
    } as never);

    const req = createRequest(
      '/api/v1/reports/balance-sheet?entityId=ent-wrong&asOfDate=2025-06-30'
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('should return balance sheet for valid params', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);
    vi.mocked(generateBalanceSheet).mockResolvedValue(MOCK_BS_REPORT);

    const entityChain = createChainMock({ data: { id: 'ent-1' }, error: null });

    vi.mocked(createServerClient).mockResolvedValue({
      from: vi.fn(() => entityChain),
    } as never);

    const req = createRequest(
      '/api/v1/reports/balance-sheet?entityId=ent-1&asOfDate=2025-06-30'
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.totalAssets).toBe(100000);
    expect(body.data.isBalanced).toBe(true);
    expect(body.data.entityName).toBe('Test Corp');

    // Verify the report generator was called with correct params
    expect(generateBalanceSheet).toHaveBeenCalledWith(
      expect.anything(),
      'ent-1',
      '2025-06-30'
    );
  });
});
