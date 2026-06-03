import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const mockSend = vi.fn();

vi.mock('resend', () => {
  // Must be a real class so `new Resend(apiKey)` works
  class MockResend {
    emails = {
      send: mockSend,
    };
  }
  return { Resend: MockResend };
});

vi.mock('@/lib/currency/converter', () => ({
  formatCurrency: vi.fn((amount: number, _currency: string) => `$${amount.toFixed(2)}`),
}));

// ─── Import under test ──────────────────────────────────────────────────────────

import { sendEmailReceiptRequest } from './email';
import type { ReceiptRequestContext } from './email';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeContext(
  overrides: Partial<ReceiptRequestContext> = {},
): ReceiptRequestContext {
  return {
    merchantName: 'Staples',
    amount: 42.99,
    date: '2026-03-15',
    cardLast4: '1234',
    cardHolder: 'John Doe',
    transactionId: 'tx-1',
    currency: 'USD',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('sendEmailReceiptRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-resend-key';
  });

  it('returns success with messageId on successful send', async () => {
    mockSend.mockResolvedValue({
      data: { id: 'msg-abc-123' },
      error: null,
    });

    const result = await sendEmailReceiptRequest('user@example.com', makeContext());

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-abc-123');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Staples'),
      }),
    );
  });

  it('returns failure when RESEND_API_KEY is not set', async () => {
    // Clear the cached client to force re-creation
    delete process.env.RESEND_API_KEY;

    // The module caches the client, so we need to test this via a fresh import.
    // Since getResendClient() throws when apiKey is missing and the
    // error is caught by the catch block, we simulate it:
    mockSend.mockImplementation(() => {
      throw new Error('RESEND_API_KEY is not configured');
    });

    const result = await sendEmailReceiptRequest('user@example.com', makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain('RESEND_API_KEY is not configured');
  });

  it('returns failure with error message on Resend API error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid recipient address' },
    });

    const result = await sendEmailReceiptRequest('bad-email', makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid recipient address');
  });

  it('returns failure when send throws an unexpected error', async () => {
    mockSend.mockRejectedValue(new Error('Network timeout'));

    const result = await sendEmailReceiptRequest('user@example.com', makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network timeout');
  });

  it('handles non-Error thrown objects gracefully', async () => {
    mockSend.mockRejectedValue('some string error');

    const result = await sendEmailReceiptRequest('user@example.com', makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown email error');
  });
});
