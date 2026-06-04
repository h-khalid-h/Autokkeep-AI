import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockExtractReceiptData = vi.fn();
vi.mock('@/lib/ocr/extractor', () => ({
  extractReceiptData: (...args: unknown[]) => mockExtractReceiptData(...args),
}));

const mockMatchReceiptToTransaction = vi.fn();
vi.mock('@/lib/ocr/matcher', () => ({
  matchReceiptToTransaction: (...args: unknown[]) => mockMatchReceiptToTransaction(...args),
}));

// ─── Supabase admin mock ────────────────────────────────────────────────────────

let pendingResult: { data: unknown[] | null; error: unknown } = { data: [], error: null };
let retryResult: { data: unknown[] | null; error: unknown } = { data: [], error: null };

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockImplementation((_table: string) => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockImplementation((_col: string, val: unknown) => {
        // Differentiate between pending and failed queries
        if (val === 'pending') {
          chain.limit = vi.fn().mockReturnValue({
            then: vi.fn((resolve: (v: unknown) => void) => resolve(pendingResult)),
          });
        } else if (val === 'failed') {
          chain.lt = vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              then: vi.fn((resolve: (v: unknown) => void) => resolve(retryResult)),
            }),
          });
        }
        return chain;
      });
      chain.update = mockUpdate;
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.lt = vi.fn().mockReturnValue(chain);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: [], error: null }));
      return chain;
    }),
  })),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createCronRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) {
    headers['authorization'] = `Bearer ${secret}`;
  }
  return new NextRequest('http://localhost:3000/api/cron/ocr-process', {
    method: 'POST',
    headers,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../../ocr-process/route');

describe('POST /api/cron/ocr-process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    pendingResult = { data: [], error: null };
    retryResult = { data: [], error: null };
  });

  it('returns 401 without CRON_SECRET header', async () => {
    const req = createCronRequest(); // no auth header
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 with wrong CRON_SECRET', async () => {
    const req = createCronRequest('wrong-secret');
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('handles empty queue gracefully', async () => {
    pendingResult = { data: [], error: null };
    retryResult = { data: [], error: null };

    const req = createCronRequest('test-cron-secret');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.processed).toBe(0);
    expect(json.message).toBe('No pending OCR items');
  });

  it('processes items and returns matched results', async () => {
    const queueItems = [
      { id: 'ocr-1', entity_id: 'ent-1', transaction_id: null, file_url: 'https://storage/receipt1.jpg', retry_count: 0 },
      { id: 'ocr-2', entity_id: 'ent-1', transaction_id: null, file_url: 'https://storage/receipt2.jpg', retry_count: 0 },
    ];
    pendingResult = { data: queueItems, error: null };
    retryResult = { data: [], error: null };

    mockExtractReceiptData.mockResolvedValue({
      merchant: 'Amazon',
      amount: 49.99,
      date: '2024-01-15',
    });

    // First item matches, second does not
    mockMatchReceiptToTransaction
      .mockResolvedValueOnce({ transactionId: 'txn-123', confidence: 0.95 })
      .mockResolvedValueOnce(null);

    const req = createCronRequest('test-cron-secret');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.processed).toBe(2);
    expect(json.matched).toBe(1);
    expect(json.completed).toBe(1);
    expect(json.failed).toBe(0);
  });

  it('handles extraction failures gracefully', async () => {
    const queueItems = [
      { id: 'ocr-fail', entity_id: 'ent-1', transaction_id: null, file_url: 'https://storage/bad.jpg', retry_count: 0 },
    ];
    pendingResult = { data: queueItems, error: null };
    retryResult = { data: [], error: null };

    mockExtractReceiptData.mockRejectedValue(new Error('OCR engine unavailable'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.processed).toBe(1);
    expect(json.failed).toBe(1);
    expect(json.results[0].error).toBe('OCR engine unavailable');

    consoleSpy.mockRestore();
  });

  it('processes items concurrently in batches', async () => {
    // Create 5 items to test batching (CONCURRENCY_LIMIT is 3, so 2 batches)
    const queueItems = Array.from({ length: 5 }, (_, i) => ({
      id: `ocr-${i}`,
      entity_id: 'ent-1',
      transaction_id: null,
      file_url: `https://storage/receipt${i}.jpg`,
      retry_count: 0,
    }));
    pendingResult = { data: queueItems, error: null };
    retryResult = { data: [], error: null };

    mockExtractReceiptData.mockResolvedValue({ merchant: 'Test', amount: 10, date: '2024-01-01' });
    mockMatchReceiptToTransaction.mockResolvedValue(null); // all unmatched

    const req = createCronRequest('test-cron-secret');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.processed).toBe(5);
    expect(json.completed).toBe(5);
    expect(mockExtractReceiptData).toHaveBeenCalledTimes(5);
  });

  it('returns 500 on fetch queue error', async () => {
    pendingResult = { data: null, error: { message: 'DB connection lost' } };
    retryResult = { data: [], error: null };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch OCR queue');

    consoleSpy.mockRestore();
  });
});
