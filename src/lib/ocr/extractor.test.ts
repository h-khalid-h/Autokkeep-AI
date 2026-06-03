import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const mockCreate = vi.fn();

vi.mock('openai', () => {
  // Must be a real class so `new OpenAI(...)` works
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  }
  return { default: MockOpenAI };
});

// ─── Import under test ──────────────────────────────────────────────────────────

import { extractReceiptData } from './extractor';
import type { ExtractedReceiptData } from './extractor';

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('extractReceiptData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('returns structured data on successful extraction', async () => {
    const mockResponse: ExtractedReceiptData = {
      vendor: 'Staples',
      amount: 42.99,
      date: '2026-03-15',
      tax: 3.25,
      currency: 'USD',
      lineItems: [
        { description: 'Office Paper', amount: 29.99 },
        { description: 'Pens', amount: 9.75 },
      ],
    };

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockResponse),
          },
        },
      ],
    });

    const result = await extractReceiptData('https://example.com/receipt.jpg');

    expect(result.vendor).toBe('Staples');
    expect(result.amount).toBe(42.99);
    expect(result.date).toBe('2026-03-15');
    expect(result.tax).toBe(3.25);
    expect(result.currency).toBe('USD');
    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems[0].description).toBe('Office Paper');
  });

  it('throws on OpenAI API error', async () => {
    mockCreate.mockRejectedValue(new Error('Rate limit exceeded'));

    await expect(
      extractReceiptData('https://example.com/receipt.jpg'),
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('throws on empty response content', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
          },
        },
      ],
    });

    await expect(
      extractReceiptData('https://example.com/receipt.jpg'),
    ).rejects.toThrow('Empty response from OpenAI Vision');
  });

  it('throws on malformed JSON response', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'not valid json {{{',
          },
        },
      ],
    });

    await expect(
      extractReceiptData('https://example.com/receipt.jpg'),
    ).rejects.toThrow();
  });

  it('throws when vendor is missing from parsed response', async () => {
    const incomplete = {
      vendor: '',
      amount: 10,
      date: '2026-01-01',
      tax: null,
      currency: 'USD',
      lineItems: [],
    };

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(incomplete),
          },
        },
      ],
    });

    await expect(
      extractReceiptData('https://example.com/receipt.jpg'),
    ).rejects.toThrow('Invalid receipt data');
  });

  it('defaults currency to USD and date to today when not provided', async () => {
    const partialResponse = {
      vendor: 'LocalShop',
      amount: 15.0,
      date: '',
      tax: null,
      currency: '',
      lineItems: [],
    };

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(partialResponse),
          },
        },
      ],
    });

    const result = await extractReceiptData('https://example.com/receipt.jpg');

    expect(result.currency).toBe('USD');
    // date should be today's date in YYYY-MM-DD
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
