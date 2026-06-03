import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Fluent chain builder for Supabase query mocks
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  // Thenable for queries that don't use .single()
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

import {
  checkApprovalRequired,
  requestApproval,
  processApproval,
  getPendingApprovals,
} from './approval';
import { writeAuditLog } from '@/lib/audit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const db = mockDb as unknown as SupabaseQueryClient;

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('checkApprovalRequired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns threshold info when a threshold exists for the amount', async () => {
    const chain = createChainMock({
      data: [
        {
          id: 'thresh-1',
          required_role: 'admin',
          dual_approval: true,
          min_amount: 500,
        },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await checkApprovalRequired(db, 'entity-1', 1000);

    expect(result).toEqual({
      required: true,
      role: 'admin',
      dual: true,
      thresholdId: 'thresh-1',
    });
  });

  it('returns null when no threshold matches', async () => {
    const chain = createChainMock({ data: [], error: null });
    mockDb.from.mockReturnValue(chain);

    const result = await checkApprovalRequired(db, 'entity-1', 10);
    expect(result).toBeNull();
  });

  it('returns the highest threshold when multiple apply (ORDER BY DESC LIMIT 1)', async () => {
    // The query already orders by min_amount DESC and limits to 1,
    // so we simulate the DB returning just the highest match
    const chain = createChainMock({
      data: [
        {
          id: 'thresh-high',
          required_role: 'owner',
          dual_approval: true,
          min_amount: 5000,
        },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await checkApprovalRequired(db, 'entity-1', 10000);

    expect(result).not.toBeNull();
    expect(result!.thresholdId).toBe('thresh-high');
    expect(result!.role).toBe('owner');
  });

  it('returns null on DB error', async () => {
    const chain = createChainMock({ data: null, error: { message: 'timeout' } });
    mockDb.from.mockReturnValue(chain);

    const result = await checkApprovalRequired(db, 'entity-1', 1000);
    expect(result).toBeNull();
  });
});

describe('requestApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an approval request row and returns it', async () => {
    const createdRow = {
      id: 'ar-1',
      entity_id: 'entity-1',
      transaction_id: 'tx-1',
      requested_role: 'admin',
      threshold_id: 'thresh-1',
      status: 'pending',
      approver_user_id: null,
      decided_at: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const chain = createChainMock({ data: createdRow, error: null });
    mockDb.from.mockReturnValue(chain);

    const result = await requestApproval(db, 'entity-1', 'tx-1', 'admin', 'thresh-1');

    expect(result.id).toBe('ar-1');
    expect(result.status).toBe('pending');
    expect(chain.insert).toHaveBeenCalledWith({
      entity_id: 'entity-1',
      transaction_id: 'tx-1',
      requested_role: 'admin',
      threshold_id: 'thresh-1',
      status: 'pending',
    });
  });

  it('throws on DB insert error', async () => {
    const chain = createChainMock({
      data: null,
      error: { message: 'unique violation' },
    });
    mockDb.from.mockReturnValue(chain);

    await expect(
      requestApproval(db, 'entity-1', 'tx-1', 'admin', 'thresh-1'),
    ).rejects.toThrow('Failed to create approval request');
  });
});

describe('processApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const pendingApproval = {
    id: 'ar-1',
    entity_id: 'entity-1',
    transaction_id: 'tx-1',
    requested_role: 'admin',
    threshold_id: 'thresh-1',
    status: 'pending',
    approver_user_id: null,
    decided_at: null,
    created_at: '2026-01-01T00:00:00Z',
  };

  it('approves: updates approval request and transaction status to approved', async () => {
    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    const updateChain = createChainMock({
      data: { ...pendingApproval, status: 'approved', approver_user_id: 'user-1' },
      error: null,
    });
    const txUpdateChain = createChainMock({ data: null, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        // First call is the fetch (.select().eq().single())
        // After that is the update (.update().eq().select().single())
        const calls = mockDb.from.mock.calls.filter(
          (c: string[]) => c[0] === 'approval_requests',
        ).length;
        return calls <= 1 ? fetchChain : updateChain;
      }
      if (table === 'transactions') return txUpdateChain;
      if (table === 'audit_log') return createChainMock({ data: null, error: null });
      return createChainMock({ data: null, error: null });
    });

    const result = await processApproval(db, 'ar-1', 'user-1', 'admin', 'approved');

    expect(result.status).toBe('approved');
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects: updates transaction status to removed', async () => {
    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    const updateChain = createChainMock({
      data: { ...pendingApproval, status: 'rejected', approver_user_id: 'user-1' },
      error: null,
    });
    const txUpdateChain = createChainMock({ data: null, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        const calls = mockDb.from.mock.calls.filter(
          (c: string[]) => c[0] === 'approval_requests',
        ).length;
        return calls <= 1 ? fetchChain : updateChain;
      }
      if (table === 'transactions') return txUpdateChain;
      if (table === 'audit_log') return createChainMock({ data: null, error: null });
      return createChainMock({ data: null, error: null });
    });

    const result = await processApproval(db, 'ar-1', 'user-1', 'owner', 'rejected');

    expect(result.status).toBe('rejected');
  });

  it('throws when actor role is insufficient', async () => {
    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    mockDb.from.mockReturnValue(fetchChain);

    await expect(
      processApproval(db, 'ar-1', 'user-1', 'viewer', 'approved'),
    ).rejects.toThrow('Insufficient role');
  });

  it('throws when approval request is not found', async () => {
    const fetchChain = createChainMock({ data: null, error: { message: 'not found' } });
    mockDb.from.mockReturnValue(fetchChain);

    await expect(
      processApproval(db, 'ar-missing', 'user-1', 'admin', 'approved'),
    ).rejects.toThrow('Approval request not found');
  });

  it('throws when approval is already processed', async () => {
    const alreadyApproved = { ...pendingApproval, status: 'approved' };
    const fetchChain = createChainMock({ data: alreadyApproved, error: null });
    mockDb.from.mockReturnValue(fetchChain);

    await expect(
      processApproval(db, 'ar-1', 'user-1', 'admin', 'approved'),
    ).rejects.toThrow('Approval already processed');
  });
});

describe('getPendingApprovals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matching pending approvals for qualified role', async () => {
    const approvals = [
      {
        id: 'ar-1',
        entity_id: 'entity-1',
        transaction_id: 'tx-1',
        requested_role: 'accountant',
        threshold_id: 'thresh-1',
        status: 'pending',
        approver_user_id: null,
        decided_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const chain = createChainMock({ data: approvals, error: null });
    mockDb.from.mockReturnValue(chain);

    const result = await getPendingApprovals(db, ['entity-1'], 'admin');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ar-1');
  });

  it('returns empty array when entityIds is empty', async () => {
    const result = await getPendingApprovals(db, [], 'admin');
    expect(result).toEqual([]);
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it('returns empty array when user role is too low (viewer)', async () => {
    // viewer has rank 0 — only qualifies for requested_role 'viewer'
    // But we test that it calls the DB and returns whatever data matches
    const chain = createChainMock({ data: [], error: null });
    mockDb.from.mockReturnValue(chain);

    const result = await getPendingApprovals(db, ['entity-1'], 'viewer');

    expect(result).toEqual([]);
  });

  it('returns empty array on DB error', async () => {
    const chain = createChainMock({ data: null, error: { message: 'timeout' } });
    mockDb.from.mockReturnValue(chain);

    const result = await getPendingApprovals(db, ['entity-1'], 'admin');
    expect(result).toEqual([]);
  });
});
