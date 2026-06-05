import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

const mockSendSlackReceiptRequest = vi.fn();
const mockGetSlackClient = vi.fn();
vi.mock('../slack', () => ({
  sendSlackReceiptRequest: (...args: unknown[]) => mockSendSlackReceiptRequest(...args),
  getSlackClient: (...args: unknown[]) => mockGetSlackClient(...args),
}));

const mockSendTeamsMessage = vi.fn();
vi.mock('../teams', () => ({
  sendTeamsMessage: (...args: unknown[]) => mockSendTeamsMessage(...args),
}));

const mockSendSMS = vi.fn();
const mockSendWhatsApp = vi.fn();
const mockBuildReceiptRequestMessage = vi.fn().mockReturnValue('receipt message');
vi.mock('../twilio', () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
  sendWhatsApp: (...args: unknown[]) => mockSendWhatsApp(...args),
  buildReceiptRequestMessage: (...args: unknown[]) => mockBuildReceiptRequestMessage(...args),
}));

const mockSendEmailReceiptRequest = vi.fn();
const mockSendRawEmail = vi.fn();
vi.mock('../email', () => ({
  sendEmailReceiptRequest: (...args: unknown[]) => mockSendEmailReceiptRequest(...args),
  sendRawEmail: (...args: unknown[]) => mockSendRawEmail(...args),
}));

vi.mock('@/lib/currency/converter', () => ({
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`,
}));

vi.mock('@/lib/notifications/micro-card', () => ({
  buildSlackCard: vi.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'mock' } }]),
  buildSMSCard: vi.fn().mockReturnValue('mock sms card'),
}));

vi.mock('@/lib/ai/confidence', () => ({
  HIGH_RISK_AMOUNT: 250,
}));

import {
  dispatchReceiptRequest,
  dispatchWithFallback,
  type ChannelConnection,
  type TransactionContext,
} from '../dispatcher';

// ---- Shared fixtures ----

const baseContext: TransactionContext = {
  transactionId: 'tx-disp-001',
  merchantName: 'Test Merchant',
  amount: 50.0,
  date: '2025-06-01',
  cardLast4: '0000',
  cardHolder: 'Test User',
};

// ============================================
// dispatchReceiptRequest
// ============================================
describe('dispatchReceiptRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TEAMS_WEBHOOK_URL', 'https://teams.example.com/webhook');
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+15550001111');
  });

  it('routes to Slack and returns success result', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({ ok: true, ts: '123.456' });
    const conn: ChannelConnection = {
      channelType: 'slack',
      channelId: 'C123',
      accessToken: 'xoxb-test',
    };
    const result = await dispatchReceiptRequest(conn, baseContext);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('slack');
    expect(result.messageId).toBe('123.456');
    expect(mockSendSlackReceiptRequest).toHaveBeenCalled();
  });

  it('routes to Teams and returns success result', async () => {
    mockSendTeamsMessage.mockResolvedValue({ ok: true });
    const conn: ChannelConnection = {
      channelType: 'teams',
      channelId: 'teams-channel-id',
      webhookUrl: 'https://teams.example.com/webhook',
    };
    const result = await dispatchReceiptRequest(conn, baseContext);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('teams');
    expect(mockSendTeamsMessage).toHaveBeenCalled();
  });

  it('routes to SMS and returns success result', async () => {
    mockSendSMS.mockResolvedValue({ sid: 'SM789', status: 'queued' });
    const conn: ChannelConnection = {
      channelType: 'sms',
      channelId: '+15551234567',
    };
    const result = await dispatchReceiptRequest(conn, baseContext);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('sms');
    expect(result.messageId).toBe('SM789');
  });

  it('routes to WhatsApp and returns success result', async () => {
    mockSendWhatsApp.mockResolvedValue({ sid: 'SMWA001' });
    const conn: ChannelConnection = {
      channelType: 'whatsapp',
      channelId: 'whatsapp:+15551234567',
    };
    const result = await dispatchReceiptRequest(conn, baseContext);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('whatsapp');
    expect(result.messageId).toBe('SMWA001');
  });

  it('routes to email and returns success result', async () => {
    mockSendEmailReceiptRequest.mockResolvedValue({ success: true, messageId: 'email-123' });
    const conn: ChannelConnection = {
      channelType: 'email',
      channelId: 'user@example.com',
    };
    const result = await dispatchReceiptRequest(conn, baseContext);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('email');
    expect(result.messageId).toBe('email-123');
  });

  it('returns failure result when Slack fails', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({ ok: false, error: 'channel_not_found' });
    const conn: ChannelConnection = {
      channelType: 'slack',
      channelId: 'C123',
    };
    const result = await dispatchReceiptRequest(conn, baseContext);
    expect(result.success).toBe(false);
    expect(result.error).toBe('channel_not_found');
  });

  it('returns failure result when SMS throws', async () => {
    mockSendSMS.mockRejectedValue(new Error('Twilio down'));
    const conn: ChannelConnection = {
      channelType: 'sms',
      channelId: '+15551234567',
    };
    const result = await dispatchReceiptRequest(conn, baseContext);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Twilio down');
  });

  it('returns error for unsupported channel type', async () => {
    const conn = {
      channelType: 'pigeon' as 'slack',
      channelId: 'coo-coo',
    };
    const result = await dispatchReceiptRequest(conn, baseContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported channel type');
  });
});

// ============================================
// dispatchWithFallback
// ============================================
describe('dispatchWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TEAMS_WEBHOOK_URL', 'https://teams.example.com/webhook');
  });

  it('returns error result for empty connections array', async () => {
    const result = await dispatchWithFallback([], baseContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No channel connections');
  });

  it('returns the first successful result (slack)', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({ ok: true, ts: 'ts-slack' });
    const connections: ChannelConnection[] = [
      { channelType: 'slack', channelId: 'C001' },
      { channelType: 'sms', channelId: '+15551234567' },
    ];
    const result = await dispatchWithFallback(connections, baseContext);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('slack');
    expect(mockSendSMS).not.toHaveBeenCalled();
  });

  it('falls back to Teams when Slack fails', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({ ok: false, error: 'slack_down' });
    mockSendTeamsMessage.mockResolvedValue({ ok: true });
    const connections: ChannelConnection[] = [
      { channelType: 'slack', channelId: 'C001' },
      { channelType: 'teams', channelId: 'T001', webhookUrl: 'https://teams.example.com/webhook' },
    ];
    const result = await dispatchWithFallback(connections, baseContext);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('teams');
  });

  it('falls back through slack → teams → sms when first two fail', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({ ok: false, error: 'slack_down' });
    mockSendTeamsMessage.mockResolvedValue({ ok: false, error: 'teams_down' });
    mockSendSMS.mockResolvedValue({ sid: 'SM-fallback', status: 'queued' });
    const connections: ChannelConnection[] = [
      { channelType: 'slack', channelId: 'C001' },
      { channelType: 'teams', channelId: 'T001', webhookUrl: 'https://teams.example.com/webhook' },
      { channelType: 'sms', channelId: '+15551234567' },
    ];
    const result = await dispatchWithFallback(connections, baseContext);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('sms');
  });

  it('returns all-failed error when every channel fails', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({ ok: false, error: 'slack_down' });
    mockSendTeamsMessage.mockResolvedValue({ ok: false, error: 'teams_down' });
    const connections: ChannelConnection[] = [
      { channelType: 'slack', channelId: 'C001' },
      { channelType: 'teams', channelId: 'T001', webhookUrl: 'https://teams.example.com/webhook' },
    ];
    const result = await dispatchWithFallback(connections, baseContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('All channels failed');
  });

  it('respects preferredChannel ordering', async () => {
    mockSendSMS.mockResolvedValue({ sid: 'SM-pref', status: 'queued' });
    const connections: ChannelConnection[] = [
      { channelType: 'slack', channelId: 'C001' },
      { channelType: 'sms', channelId: '+15551234567' },
    ];
    // Prefer SMS → it should be tried first
    const result = await dispatchWithFallback(connections, baseContext, 'sms');
    expect(result.success).toBe(true);
    expect(result.channel).toBe('sms');
    // Slack should NOT have been called since SMS succeeded first
    expect(mockSendSlackReceiptRequest).not.toHaveBeenCalled();
  });

  it('uses default priority order when no preferred channel', async () => {
    mockSendSlackReceiptRequest.mockResolvedValue({ ok: true, ts: 'ts-1' });
    mockSendSMS.mockResolvedValue({ sid: 'SM-x', status: 'queued' });
    const connections: ChannelConnection[] = [
      { channelType: 'sms', channelId: '+15551234567' },
      { channelType: 'slack', channelId: 'C001' },
    ];
    // Slack has higher priority than SMS, should be tried first even though listed second
    const result = await dispatchWithFallback(connections, baseContext);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('slack');
  });
});
