// @ts-nocheck — test file with extensive dynamic mocking
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures the mock fn exists before the hoisted vi.mock factory runs
const { mockValidateRequest } = vi.hoisted(() => ({
  mockValidateRequest: vi.fn(),
}));

// Mock twilio before importing module under test
vi.mock('twilio', () => {
  const factory = vi.fn(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({ sid: 'SM123', status: 'queued', to: '+1234567890', dateCreated: new Date() }),
    },
  }));
  factory.validateRequest = mockValidateRequest;
  return { default: factory };
});

// Mock formatCurrency for deterministic output
vi.mock('@/lib/currency/converter', () => ({
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`,
}));

import {
  buildReceiptRequestMessage,
  parseTwilioWebhook,
  validateTwilioSignature,
  parseUserResponse,
  extractTransactionRef,
  type ReceiptRequestContext,
  type TwilioInboundMessage,
} from '../twilio';

// ============================================
// buildReceiptRequestMessage
// ============================================
describe('buildReceiptRequestMessage', () => {
  const context: ReceiptRequestContext = {
    merchantName: 'Uber',
    amount: 34.5,
    date: '2025-06-01',
    cardLast4: '9999',
    cardHolder: 'Alice',
    transactionId: 'tx-msg-001',
  };

  it('returns a string', () => {
    const msg = buildReceiptRequestMessage(context);
    expect(typeof msg).toBe('string');
  });

  it('greets the cardholder by name', () => {
    const msg = buildReceiptRequestMessage(context);
    expect(msg).toContain('Hey Alice');
  });

  it('includes merchant name', () => {
    const msg = buildReceiptRequestMessage(context);
    expect(msg).toContain('Uber');
  });

  it('includes formatted amount', () => {
    const msg = buildReceiptRequestMessage(context);
    expect(msg).toContain('USD 34.50');
  });

  it('includes card last 4 digits', () => {
    const msg = buildReceiptRequestMessage(context);
    expect(msg).toContain('****9999');
  });

  it('includes date', () => {
    const msg = buildReceiptRequestMessage(context);
    expect(msg).toContain('2025-06-01');
  });

  it('includes transaction reference', () => {
    const msg = buildReceiptRequestMessage(context);
    expect(msg).toContain('Ref: tx-msg-001');
  });

  it('includes reply instructions (business, personal, receipt)', () => {
    const msg = buildReceiptRequestMessage(context);
    expect(msg).toContain('business');
    expect(msg).toContain('personal');
    expect(msg).toContain('receipt');
  });

  it('uses provided currency', () => {
    const msg = buildReceiptRequestMessage({ ...context, currency: 'EUR' });
    expect(msg).toContain('EUR 34.50');
  });
});

// ============================================
// parseTwilioWebhook
// ============================================
describe('parseTwilioWebhook', () => {
  it('parses a standard SMS webhook body', () => {
    const body: Record<string, string> = {
      MessageSid: 'SM456',
      From: '+15551234567',
      To: '+15559876543',
      Body: 'business',
      NumMedia: '0',
    };
    const result = parseTwilioWebhook(body);
    expect(result.messageSid).toBe('SM456');
    expect(result.from).toBe('+15551234567');
    expect(result.to).toBe('+15559876543');
    expect(result.body).toBe('business');
    expect(result.numMedia).toBe(0);
    expect(result.mediaUrls).toEqual([]);
    expect(result.isWhatsApp).toBe(false);
  });

  it('detects WhatsApp messages from the From field', () => {
    const body: Record<string, string> = {
      MessageSid: 'SM789',
      From: 'whatsapp:+15551234567',
      To: 'whatsapp:+15559876543',
      Body: 'hello',
      NumMedia: '0',
    };
    const result = parseTwilioWebhook(body);
    expect(result.isWhatsApp).toBe(true);
  });

  it('extracts media URLs and content types', () => {
    const body: Record<string, string> = {
      MessageSid: 'SM999',
      From: '+15551234567',
      To: '+15559876543',
      Body: '',
      NumMedia: '2',
      MediaUrl0: 'https://api.twilio.com/media/img1.jpg',
      MediaContentType0: 'image/jpeg',
      MediaUrl1: 'https://api.twilio.com/media/img2.png',
      MediaContentType1: 'image/png',
    };
    const result = parseTwilioWebhook(body);
    expect(result.numMedia).toBe(2);
    expect(result.mediaUrls).toHaveLength(2);
    expect(result.mediaContentTypes).toHaveLength(2);
    expect(result.mediaUrls[0]).toBe('https://api.twilio.com/media/img1.jpg');
  });

  it('handles empty/missing fields gracefully', () => {
    const body: Record<string, string> = {};
    const result = parseTwilioWebhook(body);
    expect(result.messageSid).toBe('');
    expect(result.from).toBe('');
    expect(result.to).toBe('');
    expect(result.body).toBe('');
    expect(result.numMedia).toBe(0);
    expect(result.isWhatsApp).toBe(false);
  });
});

// ============================================
// validateTwilioSignature
// ============================================
describe('validateTwilioSignature', () => {
  beforeEach(() => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-auth-token');
    mockValidateRequest.mockReset();
  });

  it('returns true when Twilio validates the signature', () => {
    mockValidateRequest.mockReturnValue(true);
    const result = validateTwilioSignature(
      'https://example.com/webhook',
      { Body: 'test' },
      'valid-sig'
    );
    expect(result).toBe(true);
    expect(mockValidateRequest).toHaveBeenCalledWith(
      'test-auth-token',
      'valid-sig',
      'https://example.com/webhook',
      { Body: 'test' }
    );
  });

  it('returns false when Twilio rejects the signature', () => {
    mockValidateRequest.mockReturnValue(false);
    const result = validateTwilioSignature(
      'https://example.com/webhook',
      { Body: 'test' },
      'bad-sig'
    );
    expect(result).toBe(false);
  });

  it('returns false when TWILIO_AUTH_TOKEN is not set', () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    const result = validateTwilioSignature(
      'https://example.com/webhook',
      { Body: 'test' },
      'any-sig'
    );
    expect(result).toBe(false);
    expect(mockValidateRequest).not.toHaveBeenCalled();
  });
});

// ============================================
// parseUserResponse
// ============================================
describe('parseUserResponse', () => {
  function makeMessage(overrides: Partial<TwilioInboundMessage> = {}): TwilioInboundMessage {
    return {
      messageSid: 'SM000',
      from: '+1555000',
      to: '+1555999',
      body: '',
      numMedia: 0,
      mediaUrls: [],
      mediaContentTypes: [],
      isWhatsApp: false,
      ...overrides,
    };
  }

  describe('business responses', () => {
    it.each(['business', 'biz', 'work', 'yes', '1'])('recognizes "%s" as business', (word) => {
      const result = parseUserResponse(makeMessage({ body: word }));
      expect(result.type).toBe('business');
    });

    it('is case-insensitive', () => {
      const result = parseUserResponse(makeMessage({ body: 'BUSINESS' }));
      expect(result.type).toBe('business');
    });
  });

  describe('personal responses', () => {
    it.each(['personal', 'no', 'mine', '2', 'personal expense'])(
      'recognizes "%s" as personal',
      (word) => {
        const result = parseUserResponse(makeMessage({ body: word }));
        expect(result.type).toBe('personal');
      }
    );
  });

  describe('receipt responses', () => {
    it.each(['receipt', 'upload', 'uploading', '3'])(
      'recognizes "%s" as receipt (text)',
      (word) => {
        const result = parseUserResponse(makeMessage({ body: word }));
        expect(result.type).toBe('receipt');
        if (result.type === 'receipt') {
          expect(result.mediaUrls).toEqual([]);
        }
      }
    );

    it('returns receipt with mediaUrls when message has media', () => {
      const result = parseUserResponse(
        makeMessage({
          body: 'here is my receipt',
          numMedia: 1,
          mediaUrls: ['https://api.twilio.com/media/receipt.jpg'],
        })
      );
      expect(result.type).toBe('receipt');
      if (result.type === 'receipt') {
        expect(result.mediaUrls).toEqual(['https://api.twilio.com/media/receipt.jpg']);
      }
    });
  });

  describe('unknown responses', () => {
    it('returns unknown for unrecognized text', () => {
      const result = parseUserResponse(makeMessage({ body: 'what is this?' }));
      expect(result.type).toBe('unknown');
      if (result.type === 'unknown') {
        expect(result.rawMessage).toBe('what is this?');
      }
    });

    it('returns unknown for empty body with no media', () => {
      const result = parseUserResponse(makeMessage({ body: '' }));
      expect(result.type).toBe('unknown');
    });
  });
});

// ============================================
// extractTransactionRef
// ============================================
describe('extractTransactionRef', () => {
  it('extracts a transaction ref from message body', () => {
    const body = 'Some text\nRef: tx-abc-123-def\nMore text';
    expect(extractTransactionRef(body)).toBe('tx-abc-123-def');
  });

  it('extracts ref with various formats', () => {
    expect(extractTransactionRef('Ref: tx-001')).toBe('tx-001');
    expect(extractTransactionRef('Ref:  tx-multi-word-ref')).toBe('tx-multi-word-ref');
  });

  it('returns null when no ref is present', () => {
    expect(extractTransactionRef('No reference here')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractTransactionRef('')).toBeNull();
  });

  it('returns null when ref does not start with tx-', () => {
    expect(extractTransactionRef('Ref: abc-123')).toBeNull();
  });
});
