import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/vendors/service', () => ({
  recordVendorPayment: vi.fn().mockResolvedValue(undefined),
}));

// Fluent chain builder for Supabase query mocks
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

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
import { recordVendorPayment } from '@/lib/vendors/service';
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

    // F21: first call checks for existing pending (returns null), second call inserts
    const existingCheckChain = createChainMock({ data: null, error: null });
    const insertChain = createChainMock({ data: createdRow, error: null });

    let callCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        callCount++;
        return callCount <= 1 ? existingCheckChain : insertChain;
      }
      return createChainMock({ data: null, error: null });
    });

    const result = await requestApproval(db, 'entity-1', 'tx-1', 'admin', 'thresh-1');

    expect(result.id).toBe('ar-1');
    expect(result.status).toBe('pending');
    expect(insertChain.insert).toHaveBeenCalledWith({
      entity_id: 'entity-1',
      transaction_id: 'tx-1',
      requested_role: 'admin',
      threshold_id: 'thresh-1',
      status: 'pending',
    });
  });

  it('throws on DB insert error', async () => {
    // F21: first call checks for existing pending (returns null), second call fails on insert
    const existingCheckChain = createChainMock({ data: null, error: null });
    const insertChain = createChainMock({
      data: null,
      error: { message: 'unique violation' },
    });

    let callCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        callCount++;
        return callCount <= 1 ? existingCheckChain : insertChain;
      }
      return createChainMock({ data: null, error: null });
    });

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
    // Team membership check chains
    const entityIdChain = createChainMock({ data: { entity_id: 'entity-1' }, error: null });
    const orgIdChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const membershipChain = createChainMock({ data: { id: 'tm-1', role: 'admin' }, error: null });

    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    const updateChain = createChainMock({
      data: [{ ...pendingApproval, status: 'approved', approver_user_id: 'user-1' }],
      error: null,
    });
    const txUpdateChain = createChainMock({ data: null, error: null });
    // SOD check: return a transaction created by a DIFFERENT user
    const txSodChain = createChainMock({ data: { created_by: 'user-other' }, error: null });
    // F4: threshold lookup — return a valid threshold (not deleted)
    const thresholdChain = createChainMock({ data: { requires_dual_approval: false }, error: null });

    let approvalReqCallCount = 0;
    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        approvalReqCallCount++;
        // 1st: entity_id lookup (team check), 2nd: fetch full approval, 3rd+: update
        if (approvalReqCallCount <= 1) return entityIdChain;
        if (approvalReqCallCount <= 2) return fetchChain;
        return updateChain;
      }
      if (table === 'entities') return orgIdChain;
      if (table === 'team_members') return membershipChain;
      if (table === 'transactions') {
        txCallCount++;
        // 1st call: SOD check; 2nd+: status update
        return txCallCount <= 1 ? txSodChain : txUpdateChain;
      }
      if (table === 'approval_thresholds') return thresholdChain;
      if (table === 'audit_log') return createChainMock({ data: null, error: null });
      return createChainMock({ data: null, error: null });
    });

    const result = await processApproval(db, 'ar-1', 'user-1', 'admin', 'approved', ['entity-1']);

    expect(result.status).toBe('approved');
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects: updates transaction status to human_review', async () => {
    // Team membership check chains
    const entityIdChain = createChainMock({ data: { entity_id: 'entity-1' }, error: null });
    const orgIdChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const membershipChain = createChainMock({ data: { id: 'tm-1', role: 'owner' }, error: null });

    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    const updateChain = createChainMock({
      data: [{ ...pendingApproval, status: 'rejected', approver_user_id: 'user-1' }],
      error: null,
    });
    const txUpdateChain = createChainMock({ data: null, error: null });

    let approvalReqCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        approvalReqCallCount++;
        // 1st: entity_id lookup (team check), 2nd: fetch full approval, 3rd+: update
        if (approvalReqCallCount <= 1) return entityIdChain;
        if (approvalReqCallCount <= 2) return fetchChain;
        return updateChain;
      }
      if (table === 'entities') return orgIdChain;
      if (table === 'team_members') return membershipChain;
      if (table === 'transactions') return txUpdateChain;
      if (table === 'audit_log') return createChainMock({ data: null, error: null });
      return createChainMock({ data: null, error: null });
    });

    const result = await processApproval(db, 'ar-1', 'user-1', 'owner', 'rejected', ['entity-1']);

    expect(result.status).toBe('rejected');
    // Verify transaction was set to human_review (not removed)
    expect(txUpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'human_review' }),
    );
  });

  it('throws when actor role is insufficient', async () => {
    // Team membership check chains
    const entityIdChain = createChainMock({ data: { entity_id: 'entity-1' }, error: null });
    const orgIdChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const membershipChain = createChainMock({ data: { id: 'tm-1', role: 'viewer' }, error: null });
    const fetchChain = createChainMock({ data: pendingApproval, error: null });

    let approvalReqCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        approvalReqCallCount++;
        return approvalReqCallCount <= 1 ? entityIdChain : fetchChain;
      }
      if (table === 'entities') return orgIdChain;
      if (table === 'team_members') return membershipChain;
      return createChainMock({ data: null, error: null });
    });

    await expect(
      processApproval(db, 'ar-1', 'user-1', 'viewer', 'approved', ['entity-1']),
    ).rejects.toThrow('Insufficient role');
  });

  it('throws when approval request is not found', async () => {
    // The first query (entity_id lookup for team check) will also fail/return null
    // which triggers the early 'Approval request not found or access denied' error
    const fetchChain = createChainMock({ data: null, error: { message: 'not found' } });
    mockDb.from.mockReturnValue(fetchChain);

    await expect(
      processApproval(db, 'ar-missing', 'user-1', 'admin', 'approved', ['entity-1']),
    ).rejects.toThrow('Approval request not found');
  });

  it('throws when approval is already processed', async () => {
    // Team membership check chains
    const entityIdChain = createChainMock({ data: { entity_id: 'entity-1' }, error: null });
    const orgIdChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const membershipChain = createChainMock({ data: { id: 'tm-1', role: 'admin' }, error: null });

    const alreadyApproved = { ...pendingApproval, status: 'approved' };
    const fetchChain = createChainMock({ data: alreadyApproved, error: null });

    let approvalReqCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        approvalReqCallCount++;
        return approvalReqCallCount <= 1 ? entityIdChain : fetchChain;
      }
      if (table === 'entities') return orgIdChain;
      if (table === 'team_members') return membershipChain;
      return createChainMock({ data: null, error: null });
    });

    await expect(
      processApproval(db, 'ar-1', 'user-1', 'admin', 'approved', ['entity-1']),
    ).rejects.toThrow('Approval already processed');
  });

  it('calls recordVendorPayment when approved transaction has vendor_id', async () => {
    // Team membership check chains
    const entityIdChain = createChainMock({ data: { entity_id: 'entity-1' }, error: null });
    const orgIdChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const membershipChain = createChainMock({ data: { id: 'tm-1', role: 'admin' }, error: null });

    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    const updateChain = createChainMock({
      data: [{ ...pendingApproval, status: 'approved', approver_user_id: 'user-1' }],
      error: null,
    });
    const txUpdateChain = createChainMock({ data: null, error: null });
    const txSodChain = createChainMock({ data: { created_by: 'user-other' }, error: null });
    const thresholdChain = createChainMock({ data: { requires_dual_approval: false }, error: null });
    // Vendor lookup — transaction has a vendor_id
    const txVendorChain = createChainMock({
      data: { vendor_id: 'vendor-1', amount: 500, date: '2026-01-15' },
      error: null,
    });

    let approvalReqCallCount = 0;
    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        approvalReqCallCount++;
        // 1st: entity_id lookup (team check), 2nd: fetch full approval, 3rd+: update
        if (approvalReqCallCount <= 1) return entityIdChain;
        if (approvalReqCallCount <= 2) return fetchChain;
        return updateChain;
      }
      if (table === 'entities') return orgIdChain;
      if (table === 'team_members') return membershipChain;
      if (table === 'transactions') {
        txCallCount++;
        // 1st: SOD check, 2nd: status update, 3rd: vendor lookup
        if (txCallCount <= 1) return txSodChain;
        if (txCallCount <= 2) return txUpdateChain;
        return txVendorChain;
      }
      if (table === 'approval_thresholds') return thresholdChain;
      if (table === 'audit_log') return createChainMock({ data: null, error: null });
      return createChainMock({ data: null, error: null });
    });

    await processApproval(db, 'ar-1', 'user-1', 'admin', 'approved', ['entity-1']);

    expect(recordVendorPayment).toHaveBeenCalledWith(
      db,
      'vendor-1',
      500,
      '2026-01-15',
    );
  });

  it('does NOT call recordVendorPayment when vendor_id is null', async () => {
    // Team membership check chains
    const entityIdChain = createChainMock({ data: { entity_id: 'entity-1' }, error: null });
    const orgIdChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const membershipChain = createChainMock({ data: { id: 'tm-1', role: 'admin' }, error: null });

    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    const updateChain = createChainMock({
      data: [{ ...pendingApproval, status: 'approved', approver_user_id: 'user-1' }],
      error: null,
    });
    const txUpdateChain = createChainMock({ data: null, error: null });
    const txSodChain = createChainMock({ data: { created_by: 'user-other' }, error: null });
    const thresholdChain = createChainMock({ data: { requires_dual_approval: false }, error: null });
    // No vendor_id on this transaction
    const txVendorChain = createChainMock({
      data: { vendor_id: null, amount: 100, date: '2026-01-15' },
      error: null,
    });

    let approvalReqCallCount = 0;
    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        approvalReqCallCount++;
        // 1st: entity_id lookup (team check), 2nd: fetch full approval, 3rd+: update
        if (approvalReqCallCount <= 1) return entityIdChain;
        if (approvalReqCallCount <= 2) return fetchChain;
        return updateChain;
      }
      if (table === 'entities') return orgIdChain;
      if (table === 'team_members') return membershipChain;
      if (table === 'transactions') {
        txCallCount++;
        if (txCallCount <= 1) return txSodChain;
        if (txCallCount <= 2) return txUpdateChain;
        return txVendorChain;
      }
      if (table === 'approval_thresholds') return thresholdChain;
      if (table === 'audit_log') return createChainMock({ data: null, error: null });
      return createChainMock({ data: null, error: null });
    });

    await processApproval(db, 'ar-1', 'user-1', 'admin', 'approved', ['entity-1']);

    expect(recordVendorPayment).not.toHaveBeenCalled();
  });

  it('does NOT call recordVendorPayment on rejection', async () => {
    // Team membership check chains
    const entityIdChain = createChainMock({ data: { entity_id: 'entity-1' }, error: null });
    const orgIdChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const membershipChain = createChainMock({ data: { id: 'tm-1', role: 'owner' }, error: null });

    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    const updateChain = createChainMock({
      data: [{ ...pendingApproval, status: 'rejected', approver_user_id: 'user-1' }],
      error: null,
    });
    const txUpdateChain = createChainMock({ data: null, error: null });

    let approvalReqCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        approvalReqCallCount++;
        // 1st: entity_id lookup (team check), 2nd: fetch full approval, 3rd+: update
        if (approvalReqCallCount <= 1) return entityIdChain;
        if (approvalReqCallCount <= 2) return fetchChain;
        return updateChain;
      }
      if (table === 'entities') return orgIdChain;
      if (table === 'team_members') return membershipChain;
      if (table === 'transactions') return txUpdateChain;
      if (table === 'audit_log') return createChainMock({ data: null, error: null });
      return createChainMock({ data: null, error: null });
    });

    await processApproval(db, 'ar-1', 'user-1', 'owner', 'rejected', ['entity-1']);

    expect(recordVendorPayment).not.toHaveBeenCalled();
  });

  it('dual approval: first approver creates second pending request and does NOT update transaction status', async () => {
    // Team membership check chains
    const entityIdChain = createChainMock({ data: { entity_id: 'entity-1' }, error: null });
    const orgIdChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const membershipChain = createChainMock({ data: { id: 'tm-1', role: 'admin' }, error: null });

    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    const updateChain = createChainMock({
      data: [{ ...pendingApproval, status: 'approved', approver_user_id: 'user-1' }],
      error: null,
    });
    // SOD check: different user created the transaction
    const txSodChain = createChainMock({ data: { created_by: 'user-other' }, error: null });
    // Threshold requires dual approval
    const thresholdChain = createChainMock({ data: { requires_dual_approval: true }, error: null });
    // No own prior approvals from this user
    const ownPriorApprovalsChain = createChainMock({ data: [], error: null });
    // No prior approvals from other users
    const priorApprovalsChain = createChainMock({ data: [], error: null });
    // Insert chain for the second pending approval request
    const insertSecondChain = createChainMock({ data: null, error: null });
    // We should NOT see a transaction update chain being called
    const txUpdateChain = createChainMock({ data: null, error: null });

    let approvalReqCallCount = 0;
    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        approvalReqCallCount++;
        // 1st: entity_id lookup (team check), 2nd: fetch full approval,
        // 3rd: own prior approvals check, 4th: prior approvals from others,
        // 5th: update with optimistic lock, 6th: insert second pending
        if (approvalReqCallCount <= 1) return entityIdChain;
        if (approvalReqCallCount <= 2) return fetchChain;
        if (approvalReqCallCount <= 3) return ownPriorApprovalsChain;
        if (approvalReqCallCount <= 4) return priorApprovalsChain;
        if (approvalReqCallCount <= 5) return updateChain;
        return insertSecondChain;
      }
      if (table === 'entities') return orgIdChain;
      if (table === 'team_members') return membershipChain;
      if (table === 'transactions') {
        txCallCount++;
        // 1st: SOD check — there should be NO 2nd call (no status update)
        return txCallCount <= 1 ? txSodChain : txUpdateChain;
      }
      if (table === 'approval_thresholds') return thresholdChain;
      if (table === 'audit_log') return createChainMock({ data: null, error: null });
      return createChainMock({ data: null, error: null });
    });

    const result = await processApproval(db, 'ar-1', 'user-1', 'admin', 'approved', ['entity-1']);

    // Should return the approval as approved (first of two)
    expect(result.status).toBe('approved');
    // A second pending approval request should have been inserted
    expect(insertSecondChain.insert).toHaveBeenCalledWith({
      entity_id: 'entity-1',
      transaction_id: 'tx-1',
      requested_role: 'admin',
      threshold_id: 'thresh-1',
      status: 'pending',
    });
    // Transaction should NOT have been updated to 'approved' — it stays in review
    expect(txUpdateChain.update).not.toHaveBeenCalled();
    // Audit log should mention dual approval
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          dual_approval: true,
          awaiting_second_approver: true,
        }),
      }),
    );
  });

  it('dual approval: second approver (prior approval exists) completes the approval normally', async () => {
    // Team membership check chains
    const entityIdChain = createChainMock({ data: { entity_id: 'entity-1' }, error: null });
    const orgIdChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const membershipChain = createChainMock({ data: { id: 'tm-2', role: 'admin' }, error: null });

    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    const updateChain = createChainMock({
      data: [{ ...pendingApproval, status: 'approved', approver_user_id: 'user-2' }],
      error: null,
    });
    const txSodChain = createChainMock({ data: { created_by: 'user-other' }, error: null });
    const thresholdChain = createChainMock({ data: { requires_dual_approval: true }, error: null });
    // No own prior approvals from user-2
    const ownPriorApprovalsChain = createChainMock({ data: [], error: null });
    // A prior approval from a DIFFERENT user already exists
    const priorApprovalsChain = createChainMock({
      data: [{ id: 'ar-prior', approver_user_id: 'user-1' }],
      error: null,
    });
    const txUpdateChain = createChainMock({ data: null, error: null });
    const txVendorChain = createChainMock({
      data: { vendor_id: null, amount: 5000, date: '2026-06-01' },
      error: null,
    });

    let approvalReqCallCount = 0;
    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        approvalReqCallCount++;
        // 1st: entity_id lookup (team check), 2nd: fetch full approval,
        // 3rd: own prior approvals check, 4th: prior approvals from others, 5th: update
        if (approvalReqCallCount <= 1) return entityIdChain;
        if (approvalReqCallCount <= 2) return fetchChain;
        if (approvalReqCallCount <= 3) return ownPriorApprovalsChain;
        if (approvalReqCallCount <= 4) return priorApprovalsChain;
        return updateChain;
      }
      if (table === 'entities') return orgIdChain;
      if (table === 'team_members') return membershipChain;
      if (table === 'transactions') {
        txCallCount++;
        // 1st: SOD check, 2nd: status update, 3rd: vendor lookup
        if (txCallCount <= 1) return txSodChain;
        if (txCallCount <= 2) return txUpdateChain;
        return txVendorChain;
      }
      if (table === 'approval_thresholds') return thresholdChain;
      if (table === 'audit_log') return createChainMock({ data: null, error: null });
      return createChainMock({ data: null, error: null });
    });

    const result = await processApproval(db, 'ar-1', 'user-2', 'admin', 'approved', ['entity-1']);

    expect(result.status).toBe('approved');
    // Transaction should have been updated to 'approved'
    expect(txUpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('throws SOD violation when transaction creator tries to approve', async () => {
    // Team membership check chains
    const entityIdChain = createChainMock({ data: { entity_id: 'entity-1' }, error: null });
    const orgIdChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const membershipChain = createChainMock({ data: { id: 'tm-1', role: 'admin' }, error: null });

    const fetchChain = createChainMock({ data: pendingApproval, error: null });
    // SOD check: same user created the transaction
    const txSodChain = createChainMock({ data: { created_by: 'user-1' }, error: null });

    let approvalReqCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'approval_requests') {
        approvalReqCallCount++;
        // 1st: entity_id lookup (team check), 2nd+: fetch full approval
        return approvalReqCallCount <= 1 ? entityIdChain : fetchChain;
      }
      if (table === 'entities') return orgIdChain;
      if (table === 'team_members') return membershipChain;
      if (table === 'transactions') return txSodChain;
      return createChainMock({ data: null, error: null });
    });

    await expect(
      processApproval(db, 'ar-1', 'user-1', 'admin', 'approved', ['entity-1']),
    ).rejects.toThrow('SOD violation');
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
