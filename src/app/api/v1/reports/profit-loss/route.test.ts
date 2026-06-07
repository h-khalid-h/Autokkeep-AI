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

vi.mock('@/lib/reports/profit-loss', () => ({
  generateProfitAndLoss: vi.fn(),
}));

// ── Imports ─────────────────────────────────────────────────────────────────────

import { GET } from './route';
import { validateApiKey } from '@/lib/api/public-api-auth';
import { createServerClient } from '@/lib/supabase/server';
import { generateProfitAndLoss } from '@/lib/reports/profit-loss';

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

const MOCK_PNL_REPORT = {
  entityName: 'Test Corp',
  entityCurrency: 'USD',
  periodStart: '2025-01-01',
  periodEnd: '2025-06-30',
  generatedAt: '2025-07-01T12:00:00Z',
  revenue: [{ code: '4000', name: 'Sales', amount: 10000, type: 'revenue' as const }],
  totalRevenue: 10000,
  expenses: [{ code: '6000', name: 'Office', amount: 3000, type: 'expense' as const }],
  totalExpenses: 3000,
  netIncome: 7000,
};

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('GET /api/v1/reports/profit-loss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 without API key', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(
      NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    );

    const req = createRequest('/api/v1/reports/profit-loss');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('should return 400 when entityId is missing', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const req = createRequest('/api/v1/reports/profit-loss?periodStart=2025-01-01&periodEnd=2025-06-30');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('entityId');
  });

  it('should return 400 when periodStart is missing', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const req = createRequest('/api/v1/reports/profit-loss?entityId=ent-1&periodEnd=2025-06-30');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('periodStart');
  });

  it('should return 400 when periodEnd is missing', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const req = createRequest('/api/v1/reports/profit-loss?entityId=ent-1&periodStart=2025-01-01');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('periodEnd');
  });

  it('should return 403 when entity does not belong to org', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const entityChain = createChainMock({ data: null, error: { message: 'Not found' } });

    vi.mocked(createServerClient).mockResolvedValue({
      from: vi.fn(() => entityChain),
    } as never);

    const req = createRequest(
      '/api/v1/reports/profit-loss?entityId=ent-wrong&periodStart=2025-01-01&periodEnd=2025-06-30'
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('should return P&L report for valid params', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);
    vi.mocked(generateProfitAndLoss).mockResolvedValue(MOCK_PNL_REPORT);

    const entityChain = createChainMock({ data: { id: 'ent-1' }, error: null });

    vi.mocked(createServerClient).mockResolvedValue({
      from: vi.fn(() => entityChain),
    } as never);

    const req = createRequest(
      '/api/v1/reports/profit-loss?entityId=ent-1&periodStart=2025-01-01&periodEnd=2025-06-30'
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.netIncome).toBe(7000);
    expect(body.data.entityName).toBe('Test Corp');

    // Verify the report generator was called with correct params
    expect(generateProfitAndLoss).toHaveBeenCalledWith(
      expect.anything(),
      'ent-1',
      '2025-01-01',
      '2025-06-30'
    );
  });
});
