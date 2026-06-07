// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDataFetcher } from './useDataFetcher';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createMockFetcher<T>(data: T, delay = 0) {
  return vi.fn((_signal: AbortSignal) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(data), delay)),
  );
}

function createFailingFetcher(message: string, delay = 0) {
  return vi.fn((_signal: AbortSignal) =>
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(message)), delay),
    ),
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('useDataFetcher', () => {

  it('should start with isLoading=true and initial data', () => {
    const fetcher = createMockFetcher({ items: [] }, 100);
    const { result } = renderHook(() =>
      useDataFetcher({ items: [] as string[] }, fetcher),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toEqual({ items: [] });
    expect(result.current.error).toBeNull();
  });

  it('should resolve data on successful fetch', async () => {
    const fetcher = createMockFetcher({ items: ['a', 'b'] });
    const { result } = renderHook(() =>
      useDataFetcher({ items: [] as string[] }, fetcher),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ items: ['a', 'b'] });
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('should set error on fetch failure', async () => {
    const fetcher = createFailingFetcher('Network error');
    const { result } = renderHook(() =>
      useDataFetcher({ value: 0 }, fetcher),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    // Keeps initial data on error
    expect(result.current.data).toEqual({ value: 0 });
  });

  it('should refetch when called manually', async () => {
    let callCount = 0;
    const fetcher = vi.fn((_signal: AbortSignal) => {
      callCount++;
      return Promise.resolve({ count: callCount });
    });

    const { result } = renderHook(() =>
      useDataFetcher({ count: 0 }, fetcher),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data.count).toBe(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data.count).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('should not fetch when enabled=false', async () => {
    const fetcher = createMockFetcher({ ok: true });
    const { result } = renderHook(() =>
      useDataFetcher({ ok: false }, fetcher, { enabled: false }),
    );

    // Wait a tick to ensure no async calls
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ ok: false });
  });

  it('should re-fetch when deps change', async () => {
    let fetchId = 'a';
    const fetcher = vi.fn((_signal: AbortSignal) =>
      Promise.resolve({ id: fetchId }),
    );

    const { result, rerender } = renderHook(
      ({ dep }) =>
        useDataFetcher({ id: '' }, fetcher, { deps: [dep] }),
      { initialProps: { dep: 'a' } },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data.id).toBe('a');

    fetchId = 'b';
    rerender({ dep: 'b' });

    await waitFor(() => {
      expect(result.current.data.id).toBe('b');
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('should support setData for optimistic updates', async () => {
    const fetcher = createMockFetcher({ name: 'original' });
    const { result } = renderHook(() =>
      useDataFetcher({ name: '' }, fetcher),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setData({ name: 'updated' });
    });

    expect(result.current.data.name).toBe('updated');
  });

  it('should support functional setData updates', async () => {
    const fetcher = createMockFetcher({ count: 5 });
    const { result } = renderHook(() =>
      useDataFetcher({ count: 0 }, fetcher),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setData((prev) => ({ count: prev.count + 1 }));
    });

    expect(result.current.data.count).toBe(6);
  });

  it('should pass AbortSignal to fetcher', async () => {
    const fetcher = vi.fn((_signal: AbortSignal) => {
      expect(_signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve({ done: true });
    });

    renderHook(() => useDataFetcher({ done: false }, fetcher));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  it('should discard stale responses when deps change rapidly', async () => {
    const resolvers: Array<(value: { id: string }) => void> = [];

    const fetcher = vi.fn((_signal: AbortSignal) =>
      new Promise<{ id: string }>((resolve) => {
        resolvers.push(resolve);
      }),
    );

    const { result, rerender } = renderHook(
      ({ dep }) =>
        useDataFetcher({ id: '' }, fetcher, { deps: [dep] }),
      { initialProps: { dep: '1' } },
    );

    // First fetch started
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Change dep before first fetch completes
    rerender({ dep: '2' });
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Resolve second fetch first (out of order)
    resolvers[1]({ id: 'second' });

    await waitFor(() => {
      expect(result.current.data.id).toBe('second');
    });

    // Resolve first fetch (stale — should be ignored)
    resolvers[0]({ id: 'first' });

    // Wait a tick
    await act(async () => {
      await Promise.resolve();
    });

    // Should still show second, not first
    expect(result.current.data.id).toBe('second');
  });

  it('should handle non-Error throws gracefully', async () => {
    const fetcher = vi.fn(() => Promise.reject('string error'));
    const { result } = renderHook(() =>
      useDataFetcher(null, fetcher),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('An error occurred');
  });
});
