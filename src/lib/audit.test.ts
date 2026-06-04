import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/audit';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createMockSupabase(insertResult?: { error?: unknown }) {
  const insertFn = vi.fn().mockResolvedValue(insertResult ?? { error: null });
  return {
    supabase: {
      from: vi.fn().mockReturnValue({
        insert: insertFn,
      }),
    },
    insertFn,
  };
}

function createMockRequest(options?: {
  forwardedFor?: string;
  realIp?: string;
  userAgent?: string;
}): NextRequest {
  const headers: Record<string, string> = {};
  if (options?.forwardedFor) headers['x-forwarded-for'] = options.forwardedFor;
  if (options?.realIp) headers['x-real-ip'] = options.realIp;
  if (options?.userAgent) headers['user-agent'] = options.userAgent;

  return new NextRequest('http://localhost:3000/api/test', {
    method: 'POST',
    headers,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('writeAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should create audit log entry with correct fields', async () => {
    const { supabase, insertFn } = createMockSupabase();
    const request = createMockRequest({
      forwardedFor: '192.168.1.1, 10.0.0.1',
      userAgent: 'TestAgent/1.0',
    });

    await writeAuditLog({
      supabase,
      entityId: 'entity-123',
      actorId: 'user-456',
      actorType: 'human',
      action: 'create',
      targetType: 'transaction',
      targetId: 'txn-789',
      details: { amount: 100 },
      request,
    });

    expect(supabase.from).toHaveBeenCalledWith('audit_log');
    expect(insertFn).toHaveBeenCalledOnce();

    const inserted = insertFn.mock.calls[0][0];
    expect(inserted.entity_id).toBe('entity-123');
    expect(inserted.actor_id).toBe('user-456');
    expect(inserted.actor_type).toBe('human');
    expect(inserted.action).toBe('create');
    expect(inserted.target_type).toBe('transaction');
    expect(inserted.target_id).toBe('txn-789');
    expect(inserted.details).toEqual({ amount: 100 });
    expect(inserted.ip_address).toBe('192.168.1.1');
    expect(inserted.user_agent).toBe('TestAgent/1.0');
  });

  it('should handle missing optional fields with defaults', async () => {
    const { supabase, insertFn } = createMockSupabase();

    await writeAuditLog({
      supabase,
      actorType: 'system',
      action: 'sync',
      targetType: 'cron_job',
    });

    const inserted = insertFn.mock.calls[0][0];
    expect(inserted.entity_id).toBe('00000000-0000-0000-0000-000000000000');
    expect(inserted.actor_id).toBe('00000000-0000-0000-0000-000000000000');
    expect(inserted.target_id).toBeNull();
    expect(inserted.details).toEqual({});
    expect(inserted.ip_address).toBe('unknown');
    expect(inserted.user_agent).toBe('unknown');
  });

  it('should use x-real-ip when x-forwarded-for is not present', async () => {
    const { supabase, insertFn } = createMockSupabase();
    const request = createMockRequest({ realIp: '10.0.0.5' });

    await writeAuditLog({
      supabase,
      actorType: 'human',
      action: 'login',
      targetType: 'session',
      request,
    });

    const inserted = insertFn.mock.calls[0][0];
    expect(inserted.ip_address).toBe('10.0.0.5');
  });

  it('should not throw on DB failure — logs error instead', async () => {
    const { supabase } = createMockSupabase();
    // Make from().insert() throw
    supabase.from.mockReturnValue({
      insert: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    // Should NOT throw
    await expect(
      writeAuditLog({
        supabase,
        actorType: 'system',
        action: 'export',
        targetType: 'ledger',
      })
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      '[Audit] Failed to write audit log:',
      expect.any(Error),
    );
  });

  it('should normalize non-standard actions to valid enum values', async () => {
    const { supabase, insertFn } = createMockSupabase();

    await writeAuditLog({
      supabase,
      actorType: 'system',
      action: 'customer.subscription.created',
      targetType: 'webhook',
    });

    const inserted = insertFn.mock.calls[0][0];
    expect(inserted.action).toBe('webhook_received');
    expect(inserted.details).toHaveProperty('original_action', 'customer.subscription.created');
  });

  it('should normalize sync-related actions', async () => {
    const { supabase, insertFn } = createMockSupabase();

    await writeAuditLog({
      supabase,
      actorType: 'system',
      action: 'plaid_sync_refresh',
      targetType: 'connection',
    });

    const inserted = insertFn.mock.calls[0][0];
    expect(inserted.action).toBe('sync');
    expect(inserted.details).toHaveProperty('original_action', 'plaid_sync_refresh');
  });

  it('should not add original_action when action is already valid', async () => {
    const { supabase, insertFn } = createMockSupabase();

    await writeAuditLog({
      supabase,
      actorType: 'human',
      action: 'approve',
      targetType: 'transaction',
    });

    const inserted = insertFn.mock.calls[0][0];
    expect(inserted.action).toBe('approve');
    expect(inserted.details).not.toHaveProperty('original_action');
  });
});
