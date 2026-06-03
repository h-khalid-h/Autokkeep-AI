import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchReceiptRequest,
  dispatchWithFallback,
  dispatchToAllChannels,
} from './dispatcher';
import type { ChannelConnection, TransactionContext } from './dispatcher';

// ============================================
// Mock all channel modules
// ============================================
const mockSendSlackReceiptRequest = vi.fn();
const mockGetSlackClient = vi.fn();

vi.mock('./slack', () => ({
  sendSlackReceiptRequest: (...args: unknown[]) => mockSendSlackReceiptRequest(...args),
  getSlackClient: (...args: unknown[]) => mockGetSlackClient(...args),
}));

const mockSendTeamsMessage = vi.fn();
vi.mock('./teams', () => ({
  sendTeamsMessage: (...args: unknown[]) => mockSendTeamsMessage(...args),
}));

const mockSendSMS = vi.fn();
const mockSendWhatsApp = vi.fn();
const mockBuildReceiptRequestMessage = vi.fn();

vi.mock('./twilio', () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
  sendWhatsApp: (...args: unknown[]) => mockSendWhatsApp(...args),
  buildReceiptRequestMessage: (...args: unknown[]) => mockBuildReceiptRequestMessage(...args),
}));

const mockSendEmailReceiptRequest = vi.fn();
vi.mock('./email', () => ({
  sendEmailReceiptRequest: (...args: unknown[]) => mockSendEmailReceiptRequest(...args),
}));

vi.mock('@/lib/notifications/micro-card', () => ({
  buildSlackCard: vi.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'mock' } }]),
  buildSMSCard: vi.fn().mockReturnValue('Mock SMS card'),
}));

vi.mock('@/lib/currency/converter', () => ({
  formatCurrency: vi.fn((amount: number, currency?: string) => `${currency || 'USD'} ${amount.toFixed(2)}`),
}));

// ============================================
// Fixtures
// ============================================
function makeContext(overrides: Partial<TransactionContext> = {}): TransactionContext {
  return {
    transactionId: 'tx-001',
    merchantName: 'Starbucks',
    amount: 42.50,
    date: '2025-06-15',
    cardLast4: '4242',
    cardHolder: 'John Doe',
    ...overrides,
  };
}

function makeConnection(overrides: Partial<ChannelConnection> = {}): ChannelConnection {
  return {
    channelType: 'slack',
    channelId: 'C12345',
    accessToken: 'xoxb-test-token',
    ...overrides,
  };
}

// ============================================
// Tests
// ============================================
beforeEach(() => {
  vi.clearAllMocks();
  mockBuildReceiptRequestMessage.mockReturnValue('Receipt request message');
});

describe('dispatchReceiptRequest', () => {
  describe('dispatches to correct channel type', () => {
    it('dispatches to Slack channel', async () => {
      mockSendSlackReceiptRequest.mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
      });

      const connection = makeConnection({ channelType: 'slack' });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('slack');
      expect(result.messageId).toBe('1234567890.123456');
      expect(mockSendSlackReceiptRequest).toHaveBeenCalled();
    });

    it('dispatches to Teams channel', async () => {
      mockSendTeamsMessage.mockResolvedValue({ ok: true });

      const connection = makeConnection({
        channelType: 'teams',
        webhookUrl: 'https://outlook.webhook.office.com/test',
      });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('teams');
      expect(mockSendTeamsMessage).toHaveBeenCalled();
    });

    it('dispatches to WhatsApp channel', async () => {
      mockSendWhatsApp.mockResolvedValue({ sid: 'SM123' });

      const connection = makeConnection({
        channelType: 'whatsapp',
        channelId: 'whatsapp:+1234567890',
      });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('whatsapp');
      expect(result.messageId).toBe('SM123');
    });

    it('dispatches to SMS channel', async () => {
      mockSendSMS.mockResolvedValue({ sid: 'SM456' });

      const connection = makeConnection({
        channelType: 'sms',
        channelId: '+1234567890',
      });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('sms');
      expect(result.messageId).toBe('SM456');
    });

    it('dispatches to Email channel', async () => {
      mockSendEmailReceiptRequest.mockResolvedValue({
        success: true,
        messageId: 'email-123',
      });

      const connection = makeConnection({
        channelType: 'email',
        channelId: 'user@example.com',
      });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('email');
      expect(result.messageId).toBe('email-123');
    });
  });

  describe('handles errors', () => {
    it('returns error for unsupported channel type', async () => {
      const connection = makeConnection({ channelType: 'pigeon' as ChannelConnection['channelType'] });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported channel type');
    });

    it('catches thrown errors and returns error result', async () => {
      mockSendSlackReceiptRequest.mockRejectedValue(new Error('Slack API down'));

      const connection = makeConnection({ channelType: 'slack' });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(false);
      expect(result.channel).toBe('slack');
      expect(result.error).toBe('Slack API down');
    });

    it('handles non-Error thrown objects', async () => {
      mockSendSlackReceiptRequest.mockRejectedValue('string error');

      const connection = makeConnection({ channelType: 'slack' });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Dispatch failed');
    });

    it('returns error for Teams when no webhook URL configured', async () => {
      const originalEnv = process.env.TEAMS_WEBHOOK_URL;
      delete process.env.TEAMS_WEBHOOK_URL;

      const connection = makeConnection({
        channelType: 'teams',
        webhookUrl: undefined,
      });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No Teams webhook URL configured');

      process.env.TEAMS_WEBHOOK_URL = originalEnv;
    });

    it('handles WhatsApp send failure', async () => {
      mockSendWhatsApp.mockRejectedValue(new Error('Twilio auth failed'));

      const connection = makeConnection({
        channelType: 'whatsapp',
        channelId: '+1234567890',
      });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(false);
      expect(result.channel).toBe('whatsapp');
      expect(result.error).toBe('Twilio auth failed');
    });

    it('handles SMS send failure', async () => {
      mockSendSMS.mockRejectedValue(new Error('Invalid phone number'));

      const connection = makeConnection({
        channelType: 'sms',
        channelId: '+invalid',
      });
      const context = makeContext();
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(false);
      expect(result.channel).toBe('sms');
      expect(result.error).toBe('Invalid phone number');
    });
  });

  describe('Slack with confidence data uses micro-card', () => {
    it('uses micro-card when confidence is defined', async () => {
      const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts-123' });
      mockGetSlackClient.mockReturnValue({
        chat: { postMessage: mockPostMessage },
      });

      const connection = makeConnection({ channelType: 'slack' });
      const context = makeContext({ confidence: 85 });
      const result = await dispatchReceiptRequest(connection, context);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('slack');
      // Should NOT call the standard sendSlackReceiptRequest
      expect(mockSendSlackReceiptRequest).not.toHaveBeenCalled();
    });
  });
});

// ============================================
// dispatchWithFallback
// ============================================
describe('dispatchWithFallback', () => {
  it('returns error when no connections provided', async () => {
    const context = makeContext();
    const result = await dispatchWithFallback([], context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No channel connections configured');
  });

  it('returns first successful result', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({
      ok: true,
      ts: 'ts-first',
    });

    const connections = [makeConnection({ channelType: 'slack' })];
    const context = makeContext();
    const result = await dispatchWithFallback(connections, context);

    expect(result.success).toBe(true);
    expect(result.channel).toBe('slack');
  });

  it('falls back to next channel on failure', async () => {
    // Slack fails
    mockSendSlackReceiptRequest.mockResolvedValue({
      ok: false,
      error: 'channel_not_found',
    });
    // SMS succeeds
    mockSendSMS.mockResolvedValue({ sid: 'SM-fallback' });

    const connections = [
      makeConnection({ channelType: 'slack' }),
      makeConnection({ channelType: 'sms', channelId: '+1234567890' }),
    ];
    const context = makeContext();
    const result = await dispatchWithFallback(connections, context);

    expect(result.success).toBe(true);
    expect(result.channel).toBe('sms');
    expect(result.messageId).toBe('SM-fallback');
  });

  it('returns all-failed error when all channels fail', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({
      ok: false,
      error: 'Slack down',
    });
    mockSendSMS.mockRejectedValue(new Error('SMS failed'));

    const connections = [
      makeConnection({ channelType: 'slack' }),
      makeConnection({ channelType: 'sms', channelId: '+1234567890' }),
    ];
    const context = makeContext();
    const result = await dispatchWithFallback(connections, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('All channels failed');
  });

  it('tries preferred channel first', async () => {
    mockSendSMS.mockResolvedValue({ sid: 'SM-preferred' });

    const connections = [
      makeConnection({ channelType: 'slack' }),
      makeConnection({ channelType: 'sms', channelId: '+1234567890' }),
    ];
    const context = makeContext();
    const result = await dispatchWithFallback(connections, context, 'sms');

    // SMS should be tried first since it's the preferred channel
    expect(result.success).toBe(true);
    expect(result.channel).toBe('sms');
    // Slack should not even be attempted
    expect(mockSendSlackReceiptRequest).not.toHaveBeenCalled();
  });
});

// ============================================
// dispatchToAllChannels
// ============================================
describe('dispatchToAllChannels', () => {
  it('dispatches to all channels and collects results', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({ ok: true, ts: 'ts-all' });
    mockSendSMS.mockResolvedValue({ sid: 'SM-all' });

    const connections = [
      makeConnection({ channelType: 'slack' }),
      makeConnection({ channelType: 'sms', channelId: '+1234567890' }),
    ];
    const context = makeContext();
    const results = await dispatchToAllChannels(connections, context);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[0].channel).toBe('slack');
    expect(results[1].success).toBe(true);
    expect(results[1].channel).toBe('sms');
  });

  it('handles partial failures', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({ ok: true, ts: 'ts-ok' });
    mockSendSMS.mockRejectedValue(new Error('SMS quota exceeded'));

    const connections = [
      makeConnection({ channelType: 'slack' }),
      makeConnection({ channelType: 'sms', channelId: '+1234567890' }),
    ];
    const context = makeContext();
    const results = await dispatchToAllChannels(connections, context);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBeDefined();
  });
});

// ============================================
// buildReceiptRequestMessage (via twilio mock)
// ============================================
describe('buildReceiptRequestMessage', () => {
  it('is called with correct context during WhatsApp dispatch', async () => {
    mockSendWhatsApp.mockResolvedValue({ sid: 'SM-wa' });
    mockBuildReceiptRequestMessage.mockReturnValue('Formatted receipt message');

    const connection = makeConnection({
      channelType: 'whatsapp',
      channelId: '+1234567890',
    });
    const context = makeContext({
      transactionId: 'tx-fmt-001',
      merchantName: 'Uber Eats',
      amount: 35.99,
      cardLast4: '8888',
      cardHolder: 'Jane Smith',
    });
    await dispatchReceiptRequest(connection, context);

    expect(mockBuildReceiptRequestMessage).toHaveBeenCalledWith({
      transactionId: 'tx-fmt-001',
      merchantName: 'Uber Eats',
      amount: 35.99,
      date: '2025-06-15',
      cardLast4: '8888',
      cardHolder: 'Jane Smith',
    });
  });

  it('passes built message to sendWhatsApp', async () => {
    mockBuildReceiptRequestMessage.mockReturnValue('Hey Jane! Autokkeep detected...');
    mockSendWhatsApp.mockResolvedValue({ sid: 'SM-test' });

    const connection = makeConnection({
      channelType: 'whatsapp',
      channelId: '+1234567890',
    });
    const context = makeContext();
    await dispatchReceiptRequest(connection, context);

    expect(mockSendWhatsApp).toHaveBeenCalledWith({
      to: '+1234567890',
      message: 'Hey Jane! Autokkeep detected...',
    });
  });
});
