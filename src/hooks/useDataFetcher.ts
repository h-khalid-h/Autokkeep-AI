/**
 * useDataFetcher — Production-grade data fetching hook.
 *
 * Replaces the anti-pattern of calling async-setState functions inside useEffect.
 * All state transitions happen in .then()/.catch() callbacks (async), which the
 * react-hooks/set-state-in-effect lint rule correctly allows.
 *
 * Features:
 *  - AbortController for effect cleanup (prevents memory leaks)
 *  - Race condition prevention via fetch counter
 *  - Manual refetch for event handlers (buttons, forms)
 *  - Dependency-driven re-fetches (filter changes)
 *  - Stale-while-revalidate: keeps previous data visible during refetch
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface DataFetcherState<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
}

export interface UseDataFetcherResult<T> extends DataFetcherState<T> {
  /** Trigger a manual refetch (safe to call from event handlers). */
  refetch: () => Promise<void>;
  /** Directly update the cached data without refetching. */
  setData: React.Dispatch<React.SetStateAction<T>>;
}

export interface UseDataFetcherOptions {
  /**
   * Dependency array that triggers automatic re-fetch when values change.
   * Equivalent to useEffect deps.
   */
  deps?: unknown[];
  /** If false, skips the initial fetch (useful for conditional fetching). */
  enabled?: boolean;
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

/**
 * @param initialData  Default/fallback data returned before the first fetch completes.
 * @param fetcher      Async function that receives an AbortSignal and returns data of type T.
 * @param options      Optional configuration: deps for re-fetching, enabled flag.
 */
export function useDataFetcher<T>(
  initialData: T,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseDataFetcherOptions = {},
): UseDataFetcherResult<T> {
  const { deps = [], enabled = true } = options;

  const [state, setState] = useState<DataFetcherState<T>>({
    data: initialData,
    isLoading: enabled,
    error: null,
  });

  // Keep fetcher ref stable so the effect doesn't re-run on every render.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  // Counter to discard stale responses after deps change.
  const fetchIdRef = useRef(0);

  // ── Effect-driven fetch (initial + dep changes) ────────────────────────────
  //
  // KEY DESIGN: setState calls are inside .then()/.catch() callbacks.
  // These execute asynchronously AFTER the effect returns, satisfying the
  // react-hooks/set-state-in-effect rule without eslint-disable.
  //
  useEffect(() => {
    if (!enabled) return;

    const id = ++fetchIdRef.current;
    const controller = new AbortController();

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        // Only apply if this is still the latest fetch
        if (id === fetchIdRef.current && !controller.signal.aborted) {
          setState({ data, isLoading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (id === fetchIdRef.current && !controller.signal.aborted) {
          const message =
            err instanceof Error ? err.message : 'An error occurred';
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: message,
          }));
        }
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  // ── Manual refetch (event handlers — no lint concern) ──────────────────────

  const refetch = useCallback(async () => {
    const id = ++fetchIdRef.current;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const data = await fetcherRef.current(new AbortController().signal);
      if (id === fetchIdRef.current) {
        setState({ data, isLoading: false, error: null });
      }
    } catch (err: unknown) {
      if (id === fetchIdRef.current) {
        const message =
          err instanceof Error ? err.message : 'An error occurred';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
      }
    }
  }, []);

  // ── Direct data setter (for optimistic updates) ────────────────────────────

  const setData = useCallback(
    (updater: React.SetStateAction<T>) => {
      setState((prev) => ({
        ...prev,
        data: typeof updater === 'function'
          ? (updater as (prev: T) => T)(prev.data)
          : updater,
      }));
    },
    [],
  );

  return {
    data: state.data,
    isLoading: state.isLoading,
    error: state.error,
    refetch,
    setData,
  };
}
