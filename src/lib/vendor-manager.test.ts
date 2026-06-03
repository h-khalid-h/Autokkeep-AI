import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Fluent chain builder for Supabase query mocks
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);

  // Terminal — resolves the thenable
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

const mockDb = {
  from: vi.fn(),
  storage: { from: vi.fn() },
  rpc: vi.fn(),
  auth: {},
};

// ─── Import under test ──────────────────────────────────────────────────────────

import { resolveVendorManager } from './vendor-manager';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const db = mockDb as unknown as SupabaseQueryClient;

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('resolveVendorManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Guard clauses ─────────────────────────────────────────────────────────

  it('returns null when merchantName is empty', async () => {
    const result = await resolveVendorManager(db, 'entity-1', '');
    expect(result).toBeNull();
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it('returns null when entityId is empty', async () => {
    const result = await resolveVendorManager(db, '', 'Amazon');
    expect(result).toBeNull();
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  // ── Match found ───────────────────────────────────────────────────────────

  it('returns userId/email/name when a vendor pattern matches', async () => {
    const vendorChain = createChainMock({
      data: [
        {
          id: 'vm-1',
          entity_id: 'entity-1',
          vendor_pattern: '%AMAZON%',
          manager_user_id: 'user-42',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const memberChain = createChainMock({
      data: [
        {
          user_id: 'user-42',
          invited_email: 'jane@acme.com',
          display_name: 'Jane Doe',
        },
      ],
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'vendor_managers') return vendorChain;
      if (table === 'team_members') return memberChain;
      return createChainMock({ data: null, error: null });
    });

    const result = await resolveVendorManager(db, 'entity-1', 'Amazon Web Services');

    expect(result).toEqual({
      userId: 'user-42',
      email: 'jane@acme.com',
      name: 'Jane Doe',
    });
  });

  // ── No match ──────────────────────────────────────────────────────────────

  it('returns null when no vendor pattern matches the merchant', async () => {
    const vendorChain = createChainMock({
      data: [
        {
          id: 'vm-1',
          entity_id: 'entity-1',
          vendor_pattern: '%GOOGLE%',
          manager_user_id: 'user-99',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    });

    mockDb.from.mockReturnValue(vendorChain);

    const result = await resolveVendorManager(db, 'entity-1', 'Amazon Web Services');
    expect(result).toBeNull();
  });

  it('returns null when vendor_managers table is empty', async () => {
    const vendorChain = createChainMock({ data: [], error: null });
    mockDb.from.mockReturnValue(vendorChain);

    const result = await resolveVendorManager(db, 'entity-1', 'Amazon');
    expect(result).toBeNull();
  });

  // ── Multiple patterns — first match wins ──────────────────────────────────

  it('returns the first matching vendor manager when multiple patterns exist', async () => {
    const vendorChain = createChainMock({
      data: [
        {
          id: 'vm-1',
          entity_id: 'entity-1',
          vendor_pattern: '%AMAZON%',
          manager_user_id: 'user-first',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'vm-2',
          entity_id: 'entity-1',
          vendor_pattern: '%Amazon Web%',
          manager_user_id: 'user-second',
          created_at: '2026-01-02T00:00:00Z',
        },
      ],
      error: null,
    });

    const memberChain = createChainMock({
      data: [
        {
          user_id: 'user-first',
          invited_email: 'first@acme.com',
          display_name: 'First Manager',
        },
      ],
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'vendor_managers') return vendorChain;
      if (table === 'team_members') return memberChain;
      return createChainMock({ data: null, error: null });
    });

    const result = await resolveVendorManager(db, 'entity-1', 'Amazon Web Services');

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('user-first');
  });

  // ── DB error handling ─────────────────────────────────────────────────────

  it('returns null when vendor_managers query returns an error', async () => {
    const vendorChain = createChainMock({
      data: null,
      error: { message: 'DB connection failed' },
    });
    mockDb.from.mockReturnValue(vendorChain);

    const result = await resolveVendorManager(db, 'entity-1', 'Amazon');
    expect(result).toBeNull();
  });

  it('returns userId without email/name when team_members lookup has no data', async () => {
    const vendorChain = createChainMock({
      data: [
        {
          id: 'vm-1',
          entity_id: 'entity-1',
          vendor_pattern: '%AMAZON%',
          manager_user_id: 'user-42',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    });

    const memberChain = createChainMock({ data: [], error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'vendor_managers') return vendorChain;
      if (table === 'team_members') return memberChain;
      return createChainMock({ data: null, error: null });
    });

    const result = await resolveVendorManager(db, 'entity-1', 'Amazon Web Services');

    expect(result).toEqual({
      userId: 'user-42',
      email: undefined,
      name: undefined,
    });
  });
});
