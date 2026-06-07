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

// ── Imports ─────────────────────────────────────────────────────────────────────

import { GET } from './route';
import { validateApiKey } from '@/lib/api/public-api-auth';
import { createServerClient } from '@/lib/supabase/server';

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

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('GET /api/v1/categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when no API key is provided', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(
      NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    );

    const req = createRequest('/api/v1/categories');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Missing API key');
  });

  it('should return categories for valid API key', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const entitiesChain = createChainMock({
      data: [{ id: 'ent-1' }, { id: 'ent-2' }],
      error: null,
    });
    const categoriesChain = createChainMock({
      data: [
        { id: 'coa-1', entity_id: 'ent-1', code: '4000', name: 'Sales Revenue', type: 'revenue', is_active: true },
        { id: 'coa-2', entity_id: 'ent-1', code: '6000', name: 'Office Supplies', type: 'expense', is_active: true },
      ],
      error: null,
    });

    let _callCount = 0;
    vi.mocked(createServerClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'entities') return entitiesChain;
        if (table === 'chart_of_accounts') return categoriesChain;
        _callCount++;
        return createChainMock({ data: [], error: null });
      }),
    } as never);

    const req = createRequest('/api/v1/categories');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].code).toBe('4000');
  });

  it('should filter by entityId when provided', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const entitiesChain = createChainMock({
      data: [{ id: 'ent-1' }, { id: 'ent-2' }],
      error: null,
    });
    const categoriesChain = createChainMock({
      data: [
        { id: 'coa-1', entity_id: 'ent-1', code: '4000', name: 'Sales Revenue', type: 'revenue', is_active: true },
      ],
      error: null,
    });

    vi.mocked(createServerClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'entities') return entitiesChain;
        if (table === 'chart_of_accounts') return categoriesChain;
        return createChainMock({ data: [], error: null });
      }),
    } as never);

    const req = createRequest('/api/v1/categories?entityId=ent-1');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    // Verify .in() was called with the specific entityId
    expect(categoriesChain.in).toHaveBeenCalledWith('entity_id', ['ent-1']);
  });

  it('should return empty array when no entities found', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const entitiesChain = createChainMock({
      data: [],
      error: null,
    });

    vi.mocked(createServerClient).mockResolvedValue({
      from: vi.fn(() => entitiesChain),
    } as never);

    const req = createRequest('/api/v1/categories');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('should return 500 when database query fails', async () => {
    vi.mocked(validateApiKey).mockResolvedValue(MOCK_CTX);

    const entitiesChain = createChainMock({
      data: [{ id: 'ent-1' }],
      error: null,
    });
    const categoriesChain = createChainMock({
      data: null,
      error: { message: 'DB connection failed' },
    });

    vi.mocked(createServerClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'entities') return entitiesChain;
        if (table === 'chart_of_accounts') return categoriesChain;
        return createChainMock({ data: [], error: null });
      }),
    } as never);

    const req = createRequest('/api/v1/categories');
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to fetch categories');
  });
});
