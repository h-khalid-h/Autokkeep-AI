import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getEscalationLevel,
  getEscalationChannel,
  shouldChaseNow,
  buildChaseMessage,
} from './chase-agent';
import type { EscalationLevel, ChaseConfig } from './chase-agent';
import type { ChannelConnection } from './dispatcher';

// ============================================
// Mock dependencies (formatCurrency used in buildChaseMessage)
// ============================================
vi.mock('@/lib/currency/converter', () => ({
  formatCurrency: (amount: number, currency: string) =>
    `$${amount.toFixed(2)} ${currency}`,
}));

// Mock Redis for lock tests
vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn().mockReturnValue(null),
}));

// Mock dependencies required by runReceiptChase
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/vendor-manager', () => ({
  resolveVendorManager: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/user-channel-prefs', () => ({
  getUserChannelPreference: vi.fn().mockResolvedValue(null),
}));

vi.mock('./twilio', () => ({
  sendSMS: vi.fn().mockResolvedValue({ sid: 'sms-1' }),
  sendWhatsApp: vi.fn().mockResolvedValue({ sid: 'wa-1' }),
}));

vi.mock('./dispatcher', async () => {
  const actual = await vi.importActual('./dispatcher');
  return {
    ...actual,
    dispatchReceiptRequest: vi.fn().mockResolvedValue({ success: true, channel: 'slack' }),
  };
});


// ============================================
// Test fixtures
// ============================================

interface MockOutstandingTransaction {
  id: string;
  merchant_name: string | null;
  merchant_raw: string | null;
  amount: string;
  date: string;
  card_last4: string | null;
  card_holder: string | null;
  entity_id: string;
  category_ai: string | null;
  category_human: string | null;
  confidence: string | null;
  currency: string | null;
  created_at: string;
}

function makeTx(overrides: Partial<MockOutstandingTransaction> = {}): MockOutstandingTransaction {
  return {
    id: 'tx-1',
    merchant_name: 'Starbucks',
    merchant_raw: 'STARBUCKS #12345',
    amount: '5.50',
    date: '2025-06-01',
    card_last4: '4242',
    card_holder: 'John Doe',
    entity_id: 'entity-1',
    category_ai: 'Meals',
    category_human: '6400',
    confidence: '0.85',
    currency: 'USD',
    created_at: '2025-06-01T10:00:00Z',
    ...overrides,
  };
}

function makeConnection(
  channelType: 'sms' | 'whatsapp' | 'slack' | 'teams',
  channelId: string = '+15551234567'
): ChannelConnection {
  return {
    channelType,
    channelId,
    accessToken: channelType === 'slack' ? 'xoxb-token' : undefined,
    webhookUrl: channelType === 'teams' ? 'https://teams.webhook.url' : undefined,
  };
}

// ============================================
// getEscalationLevel
// ============================================
describe('getEscalationLevel', () => {
  it('returns "standard" for 0 prior chases', () => {
    expect(getEscalationLevel(0)).toBe('standard');
  });

  it('returns "urgent" for 1 prior chase', () => {
    expect(getEscalationLevel(1)).toBe('urgent');
  });

  it('returns "final" for 2 prior chases', () => {
    expect(getEscalationLevel(2)).toBe('final');
  });

  it('returns "final" for 3+ prior chases', () => {
    expect(getEscalationLevel(3)).toBe('final');
    expect(getEscalationLevel(10)).toBe('final');
  });
});

// ============================================
// getEscalationChannel
// ============================================
describe('getEscalationChannel', () => {
  it('prefers WhatsApp for standard escalation', () => {
    const connections = [
      makeConnection('sms'),
      makeConnection('whatsapp'),
      makeConnection('slack', 'C12345'),
    ];
    const result = getEscalationChannel('standard', connections);
    expect(result?.channelType).toBe('whatsapp');
  });

  it('falls back to SMS when WhatsApp unavailable for standard', () => {
    const connections = [makeConnection('sms')];
    const result = getEscalationChannel('standard', connections);
    expect(result?.channelType).toBe('sms');
  });

  it('prefers Slack for urgent escalation', () => {
    const connections = [
      makeConnection('sms'),
      makeConnection('whatsapp'),
      makeConnection('slack', 'C12345'),
    ];
    const result = getEscalationChannel('urgent', connections);
    expect(result?.channelType).toBe('slack');
  });

  it('prefers Slack for final escalation', () => {
    const connections = [
      makeConnection('sms'),
      makeConnection('slack', 'C12345'),
    ];
    const result = getEscalationChannel('final', connections);
    expect(result?.channelType).toBe('slack');
  });

  it('returns null when no channels available', () => {
    const result = getEscalationChannel('standard', []);
    expect(result).toBeNull();
  });

  it('falls back to WhatsApp for urgent when Slack unavailable', () => {
    const connections = [makeConnection('whatsapp'), makeConnection('sms')];
    const result = getEscalationChannel('urgent', connections);
    expect(result?.channelType).toBe('whatsapp');
  });
});

// ============================================
// shouldChaseNow
// ============================================
describe('shouldChaseNow', () => {
  const weekdayConfig: ChaseConfig = {
    minHoursBetweenChases: 24,
    maxChaseAttempts: 3,
    minDaysBeforeChase: 3,
    skipWeekends: true,
    timezone: 'America/New_York',
  };

  describe('weekend detection', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('blocks chases on Saturday', () => {
      // June 7, 2025 is a Saturday
      vi.setSystemTime(new Date('2025-06-07T12:00:00-04:00'));

      const result = shouldChaseNow(null, 0, '2025-06-01', weekdayConfig);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Weekend');
    });

    it('blocks chases on Sunday', () => {
      // June 8, 2025 is a Sunday
      vi.setSystemTime(new Date('2025-06-08T12:00:00-04:00'));

      const result = shouldChaseNow(null, 0, '2025-06-01', weekdayConfig);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Weekend');
    });

    it('allows chases on weekdays', () => {
      // June 9, 2025 is a Monday
      vi.setSystemTime(new Date('2025-06-09T12:00:00-04:00'));

      const result = shouldChaseNow(null, 0, '2025-06-01', weekdayConfig);
      expect(result.allowed).toBe(true);
    });

    it('allows chases on weekends when skipWeekends is false', () => {
      vi.setSystemTime(new Date('2025-06-07T12:00:00-04:00'));

      const noSkipConfig = { ...weekdayConfig, skipWeekends: false };
      const result = shouldChaseNow(null, 0, '2025-06-01', noSkipConfig);
      expect(result.allowed).toBe(true);
    });
  });

  describe('max chase attempts', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Set to a known Wednesday
      vi.setSystemTime(new Date('2025-06-11T12:00:00-04:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('blocks when max attempts reached', () => {
      const result = shouldChaseNow(null, 3, '2025-06-01', weekdayConfig);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Max chase attempts');
    });

    it('allows when below max attempts', () => {
      const result = shouldChaseNow(null, 2, '2025-06-01', weekdayConfig);
      expect(result.allowed).toBe(true);
    });
  });

  describe('minimum time between chases', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-11T12:00:00-04:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('blocks when last chase was too recent', () => {
      const recentChase = new Date('2025-06-11T06:00:00-04:00').toISOString();
      const result = shouldChaseNow(recentChase, 1, '2025-06-01', weekdayConfig);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('since last chase');
    });

    it('allows when enough time has passed since last chase', () => {
      const oldChase = new Date('2025-06-09T12:00:00-04:00').toISOString();
      const result = shouldChaseNow(oldChase, 1, '2025-06-01', weekdayConfig);
      expect(result.allowed).toBe(true);
    });
  });

  describe('minimum days before first chase', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-11T12:00:00-04:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('blocks chasing transactions that are too recent', () => {
      const result = shouldChaseNow(null, 0, '2025-06-10', weekdayConfig);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Transaction too recent');
    });

    it('allows chasing transactions older than minDaysBeforeChase', () => {
      const result = shouldChaseNow(null, 0, '2025-06-01', weekdayConfig);
      expect(result.allowed).toBe(true);
    });
  });
});

// ============================================
// buildChaseMessage
// ============================================
describe('buildChaseMessage', () => {
  const singleTx = [makeTx()];
  const multipleTxs = [
    makeTx({ id: 'tx-1', merchant_name: 'Starbucks', amount: '5.50' }),
    makeTx({ id: 'tx-2', merchant_name: 'Office Depot', amount: '125.00' }),
  ];

  describe('standard level', () => {
    it('produces a friendly first-request message', () => {
      const msg = buildChaseMessage(singleTx, 'John Doe', 'standard');
      expect(msg).toContain('Hi John Doe');
      expect(msg).toContain('1 transaction');
      expect(msg).toContain('Starbucks');
      expect(msg).toContain('Reply with a photo');
      expect(msg).toContain('Autokkeep');
    });

    it('handles plural transactions', () => {
      const msg = buildChaseMessage(multipleTxs, 'Jane', 'standard');
      expect(msg).toContain('2 transactions');
    });
  });

  describe('urgent level', () => {
    it('produces a firm reminder message', () => {
      const msg = buildChaseMessage(singleTx, 'John Doe', 'urgent');
      expect(msg).toContain('Reminder');
      expect(msg).toContain('2nd request');
      expect(msg).toContain('John Doe');
      expect(msg).toContain('Starbucks');
    });
  });

  describe('final level', () => {
    it('produces a compliance notice message', () => {
      const msg = buildChaseMessage(singleTx, 'John Doe', 'final');
      expect(msg).toContain('FINAL NOTICE');
      expect(msg).toContain('compliance');
      expect(msg).toContain('flagged');
      expect(msg).toContain('Autokkeep Compliance');
    });
  });

  describe('message content', () => {
    it('includes transaction details for all levels', () => {
      const levels: EscalationLevel[] = ['standard', 'urgent', 'final'];
      for (const level of levels) {
        const msg = buildChaseMessage(singleTx, 'Test', level);
        expect(msg).toContain('Starbucks');
        expect(msg).toContain('2025-06-01');
      }
    });

    it('uses merchant_raw when merchant_name is null', () => {
      const tx = makeTx({ merchant_name: null, merchant_raw: 'RAW MERCHANT' });
      const msg = buildChaseMessage([tx], 'Test', 'standard');
      expect(msg).toContain('RAW MERCHANT');
    });

    it('shows "Unknown" when both merchant fields are null', () => {
      const tx = makeTx({ merchant_name: null, merchant_raw: null });
      const msg = buildChaseMessage([tx], 'Test', 'standard');
      expect(msg).toContain('Unknown');
    });
  });
});

// ============================================
// Chase Agent Idempotency (Lock Tests)
// ============================================

// We test the lock functions by mocking the Redis client module.
// The chase-agent module imports getRedisClient from '@/lib/redis'.

describe('Chase Agent Idempotency — acquireChaseRunLock / releaseChaseRunLock', () => {
  // We need to test the internal acquireChaseRunLock and releaseChaseRunLock
  // functions. Since they are not exported, we test them through runReceiptChase.
  // However, runReceiptChase has many dependencies. Instead, we re-mock the module
  // to isolate the lock behavior.

  // Strategy: dynamically import the chase-agent module with a controlled Redis mock
  // and test the locking via runReceiptChase's behavior.

  it('acquireChaseRunLock returns true when lock is available (via Redis NX)', async () => {
    // When Redis SET NX returns 'OK', the lock is acquired.
    // We verify this by checking that runReceiptChase proceeds (totalChased or queries run).
    const { getRedisClient } = await import('@/lib/redis');

    // Mock Redis to return 'OK' for SET NX
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    };

    vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);

    // Import runReceiptChase (which uses acquireChaseRunLock internally)
    const { runReceiptChase } = await import('./chase-agent');

    // Create a minimal mock supabase that returns no outstanding transactions
    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  then: (resolve: any) => resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    // Reset the in-memory guard by using a unique entity ID
    const entityId = `test-lock-acquire-${Date.now()}`;
    const report = await runReceiptChase(entityId, mockSupabase);

    // Lock was acquired (returned true) so the function proceeded
    // Verify SET was called with NX
    expect(mockRedis.set).toHaveBeenCalledWith(
      `chase_lock:${entityId}`,
      '1',
      'EX',
      120,
      'NX'
    );
    // Lock was released after run
    expect(mockRedis.del).toHaveBeenCalledWith(`chase_lock:${entityId}`);
  });

  it('acquireChaseRunLock returns false when lock is held (via Redis NX)', async () => {
    const { getRedisClient } = await import('@/lib/redis');

    // Mock Redis to return null for SET NX (lock already held)
    const mockRedis = {
      set: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
    };

    vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);

    const { runReceiptChase } = await import('./chase-agent');

    const mockSupabase: any = {
      from: vi.fn(),
    };

    const entityId = `test-lock-held-${Date.now()}`;
    const report = await runReceiptChase(entityId, mockSupabase);

    // When lock is held, runReceiptChase returns early with totalChased: 0
    expect(report.totalChased).toBe(0);
    expect(report.entityId).toBe(entityId);

    // Supabase should NOT have been called (skipped entirely)
    expect(mockSupabase.from).not.toHaveBeenCalled();

    // Redis del should NOT have been called (lock wasn't acquired)
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('releaseChaseRunLock releases the lock after successful run', async () => {
    const { getRedisClient } = await import('@/lib/redis');

    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    };

    vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);

    const { runReceiptChase } = await import('./chase-agent');

    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  then: (resolve: any) => resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const entityId = `test-lock-release-${Date.now()}`;
    await runReceiptChase(entityId, mockSupabase);

    // Verify DEL was called to release the lock
    expect(mockRedis.del).toHaveBeenCalledWith(`chase_lock:${entityId}`);
  });

  it('allows run when Redis is unavailable (fallback to in-memory)', async () => {
    const { getRedisClient } = await import('@/lib/redis');

    // Mock Redis as unavailable (returns null)
    vi.mocked(getRedisClient).mockReturnValue(null);

    const { runReceiptChase } = await import('./chase-agent');

    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  then: (resolve: any) => resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const entityId = `test-no-redis-${Date.now()}`;
    const report = await runReceiptChase(entityId, mockSupabase);

    // Should proceed without Redis (acquireChaseRunLock returns true when Redis is null)
    // The function should have queried for transactions
    expect(mockSupabase.from).toHaveBeenCalled();
    expect(report.entityId).toBe(entityId);
  });
});

