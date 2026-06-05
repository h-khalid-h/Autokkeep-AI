
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Mock @slack/web-api before importing the module under test
vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '123.456', channel: 'C123' }),
    },
  })),
}));

// Mock formatCurrency to keep tests deterministic
vi.mock('@/lib/currency/converter', () => ({
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`,
}));

import {
  buildReceiptRequestBlocks,
  parseSlackInteraction,
  verifySlackSignature,
  getSlackInstallUrl,
  type ReceiptRequestPayload,
} from '../slack';

// ============================================
// buildReceiptRequestBlocks
// ============================================
describe('buildReceiptRequestBlocks', () => {
  const basePayload: ReceiptRequestPayload = {
    transactionId: 'tx-abc-123',
    merchantName: 'Starbucks',
    amount: 12.5,
    date: '2025-06-01',
    cardLast4: '4242',
    cardHolder: 'Jane Doe',
  };

  it('returns an array of blocks', () => {
    const blocks = buildReceiptRequestBlocks(basePayload);
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThanOrEqual(4);
  });

  it('has a header block as the first element', () => {
    const blocks = buildReceiptRequestBlocks(basePayload);
    expect(blocks[0]).toEqual({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '💳 New Transaction Requires Your Input',
        emoji: true,
      },
    });
  });

  it('has a section block with merchant, amount, date, card fields', () => {
    const blocks = buildReceiptRequestBlocks(basePayload);
    const section = blocks[1];
    expect(section.type).toBe('section');
    expect(section.fields).toHaveLength(4);
    expect(section.fields![0].text).toContain('Starbucks');
    expect(section.fields![1].text).toContain('USD 12.50');
    expect(section.fields![2].text).toContain('2025-06-01');
    expect(section.fields![3].text).toContain('····4242');
  });

  it('includes AI suggestion block when suggestedCategory is provided', () => {
    const payload: ReceiptRequestPayload = {
      ...basePayload,
      suggestedCategory: 'Travel',
      suggestedGLCode: '6310',
      confidence: 80,
    };
    const blocks = buildReceiptRequestBlocks(payload);
    const aiBlock = blocks[2];
    expect(aiBlock.type).toBe('section');
    expect(aiBlock.text!.text).toContain('AI Suggestion');
    expect(aiBlock.text!.text).toContain('6310');
    expect(aiBlock.text!.text).toContain('Travel');
    expect(aiBlock.text!.text).toContain('80%');
  });

  it('uses 🟡 emoji for confidence >= 75', () => {
    const payload: ReceiptRequestPayload = {
      ...basePayload,
      suggestedCategory: 'Travel',
      suggestedGLCode: '6310',
      confidence: 75,
    };
    const blocks = buildReceiptRequestBlocks(payload);
    const aiBlock = blocks[2];
    expect(aiBlock.text!.text).toContain('🟡');
  });

  it('uses 🔴 emoji for confidence < 75', () => {
    const payload: ReceiptRequestPayload = {
      ...basePayload,
      suggestedCategory: 'Travel',
      suggestedGLCode: '6310',
      confidence: 50,
    };
    const blocks = buildReceiptRequestBlocks(payload);
    const aiBlock = blocks[2];
    expect(aiBlock.text!.text).toContain('🔴');
  });

  it('omits AI suggestion block when suggestedCategory is absent', () => {
    const blocks = buildReceiptRequestBlocks(basePayload);
    const types = blocks.map((b: { type: string }) => b.type);
    // header, section(fields), divider, section(question), actions, context
    expect(types).toEqual(['header', 'section', 'divider', 'section', 'actions', 'context']);
  });

  it('has an actions block with 5 buttons', () => {
    const blocks = buildReceiptRequestBlocks(basePayload);
    const actions = blocks.find((b: { type: string }) => b.type === 'actions');
    expect(actions).toBeDefined();
    expect(actions!.elements).toHaveLength(5);
  });

  it('includes the transactionId in action button values', () => {
    const blocks = buildReceiptRequestBlocks(basePayload);
    const actions = blocks.find((b: { type: string }) => b.type === 'actions');
    for (const element of (actions!.elements as { value: string }[])) {
      const parsed = JSON.parse(element.value);
      expect(parsed.transactionId).toBe('tx-abc-123');
    }
  });

  it('has a context block with Autokkeep branding and ref', () => {
    const blocks = buildReceiptRequestBlocks(basePayload);
    const context = blocks[blocks.length - 1];
    expect(context.type).toBe('context');
    expect(context.elements![0].text).toContain('Autokkeep');
    expect(context.elements![0].text).toContain('tx-abc-123');
  });
});

// ============================================
// parseSlackInteraction
// ============================================
describe('parseSlackInteraction', () => {
  it('parses a valid JSON action value', () => {
    const value = JSON.stringify({
      transactionId: 'tx-123',
      glCode: '6410',
      glName: 'Business Meals & Entertainment',
      action: 'categorize',
    });
    const result = parseSlackInteraction(value);
    expect(result).toEqual({
      transactionId: 'tx-123',
      glCode: '6410',
      glName: 'Business Meals & Entertainment',
      action: 'categorize',
    });
  });

  it('parses an accept action', () => {
    const value = JSON.stringify({
      transactionId: 'tx-456',
      glCode: '6310',
      action: 'accept',
    });
    const result = parseSlackInteraction(value);
    expect(result).not.toBeNull();
    expect(result!.action).toBe('accept');
    expect(result!.transactionId).toBe('tx-456');
  });

  it('returns null for invalid JSON', () => {
    expect(parseSlackInteraction('not-json')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSlackInteraction('')).toBeNull();
  });
});

// ============================================
// verifySlackSignature
// ============================================
describe('verifySlackSignature', () => {
  const signingSecret = 'test-secret-12345';
  const rawBody = 'payload=%7B%22test%22%3A%22data%22%7D';

  function computeValidSignature(timestamp: string, body: string, secret: string): string {
    const baseString = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(baseString);
    return `v0=${hmac.digest('hex')}`;
  }

  it('returns true for a valid signature with a current timestamp', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeValidSignature(timestamp, rawBody, signingSecret);
    expect(verifySlackSignature(signingSecret, timestamp, rawBody, signature)).toBe(true);
  });

  it('returns false for an incorrect signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(verifySlackSignature(signingSecret, timestamp, rawBody, 'v0=invalid')).toBe(false);
  });

  it('returns false for a timestamp older than 5 minutes', () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 6 * 60);
    const signature = computeValidSignature(oldTimestamp, rawBody, signingSecret);
    expect(verifySlackSignature(signingSecret, oldTimestamp, rawBody, signature)).toBe(false);
  });

  it('returns false for a timestamp in the far future', () => {
    const futureTimestamp = String(Math.floor(Date.now() / 1000) + 6 * 60);
    const signature = computeValidSignature(futureTimestamp, rawBody, signingSecret);
    expect(verifySlackSignature(signingSecret, futureTimestamp, rawBody, signature)).toBe(false);
  });

  it('returns false when signatures have different lengths', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(verifySlackSignature(signingSecret, timestamp, rawBody, 'v0=short')).toBe(false);
  });
});

// ============================================
// getSlackInstallUrl
// ============================================
describe('getSlackInstallUrl', () => {
  beforeEach(() => {
    vi.stubEnv('SLACK_CLIENT_ID', 'test-client-id');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.autokkeep.com');
  });

  it('returns a URL string', () => {
    const url = getSlackInstallUrl();
    expect(typeof url).toBe('string');
  });

  it('starts with Slack OAuth v2 authorize URL', () => {
    const url = getSlackInstallUrl();
    expect(url).toContain('https://slack.com/oauth/v2/authorize');
  });

  it('includes client_id parameter', () => {
    const url = getSlackInstallUrl();
    expect(url).toContain('client_id=test-client-id');
  });

  it('includes required scopes', () => {
    const url = getSlackInstallUrl();
    expect(url).toContain('chat:write');
    expect(url).toContain('users:read');
    expect(url).toContain('commands');
  });

  it('includes encoded redirect_uri', () => {
    const url = getSlackInstallUrl();
    expect(url).toContain('redirect_uri=');
    expect(url).toContain(encodeURIComponent('https://app.autokkeep.com/api/channels/slack/callback'));
  });

  it('throws if SLACK_CLIENT_ID is missing', () => {
    vi.stubEnv('SLACK_CLIENT_ID', '');
    expect(() => getSlackInstallUrl()).toThrow('Missing SLACK_CLIENT_ID');
  });
});
