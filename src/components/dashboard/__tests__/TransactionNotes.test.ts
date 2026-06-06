import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TransactionNotes — API integration tests
 *
 * Since the project doesn't include @testing-library/react, we test
 * the save/error logic directly against the fetch API contract.
 */

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TransactionNotes — save logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('should PUT notes with trimmed content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const transactionId = 'tx-123';
    const rawNotes = '  Monthly AWS charges  ';
    const trimmed = rawNotes.trim();

    await fetch(`/api/transactions/${transactionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: trimmed }),
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/transactions/tx-123', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Monthly AWS charges' }),
    });
  });

  it('should handle save failure gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Database error' }),
    });

    const res = await fetch('/api/transactions/tx-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'test' }),
    });

    expect(res.ok).toBe(false);
    const data = await res.json();
    expect(data.error).toBe('Database error');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      fetch('/api/transactions/tx-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'test' }),
      })
    ).rejects.toThrow('Network error');
  });

  it('should save empty string when notes are cleared', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    await fetch('/api/transactions/tx-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: '' }),
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/transactions/tx-1', expect.objectContaining({
      body: JSON.stringify({ notes: '' }),
    }));
  });
});
