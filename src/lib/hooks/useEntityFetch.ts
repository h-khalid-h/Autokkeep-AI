'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * Shared hook for entity-scoped API data fetching with AbortController support.
 *
 * Used by Close and Health pages to avoid duplicating the fetch+abort+error
 * pattern. Handles auto-fetch on entity change, manual refresh, and loading states.
 *
 * @param entityId - Current entity ID from EntityContext
 * @param buildUrl - Function to build the fetch URL (receives entityId and optional params)
 * @param options.autoFetch - Whether to auto-fetch when entityId changes (default: true)
 */
export interface UseEntityFetchOptions<TParams> {
  /** Whether to auto-fetch when entityId changes. Default: true */
  autoFetch?: boolean;
  /** Additional dependency params that trigger re-fetch when changed */
  params?: TParams;
}

export interface UseEntityFetchResult<TData> {
  data: TData | null;
  /** Direct setter for optimistic updates */
  setData: React.Dispatch<React.SetStateAction<TData | null>>;
  isLoading: boolean;
  error: string | null;
  /** Manual fetch / refresh */
  refetch: () => Promise<void>;
  /** Clears error state */
  clearError: () => void;
}

export function useEntityFetch<TData, TParams = undefined>(
  entityId: string | undefined,
  buildUrl: (entityId: string, params?: TParams) => string,
  options: UseEntityFetchOptions<TParams> = {}
): UseEntityFetchResult<TData> {
  const { autoFetch = true, params } = options;

  const [data, setData] = useState<TData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  // Manual fetch (no abort — used for button-triggered refreshes)
  const refetch = useCallback(async () => {
    if (!entityId) return;

    setIsLoading(true);
    setError(null);

    try {
      const url = buildUrl(entityId, params);
      const res = await fetch(url);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }

      const result: TData = await res.json();
      setData(result);
    } catch (err) {
      console.error('[useEntityFetch] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [entityId, buildUrl, params]);

  // Memoize serialized params so ESLint can validate it as a proper dependency
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  // Keep a ref to params so the effect can access the latest value without depending on object identity
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);

  // Auto-fetch with AbortController when entityId or params change
  useEffect(() => {
    if (!autoFetch || !entityId) return;

    if (!hasFetched.current) {
      hasFetched.current = true;
    }

    const controller = new AbortController();

    const doFetch = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const url = buildUrl(entityId, paramsRef.current);
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${res.status})`);
        }

        const result: TData = await res.json();
        setData(result);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[useEntityFetch] Fetch error:', err);
          setError(err instanceof Error ? err.message : 'Failed to load data');
        }
      } finally {
        setIsLoading(false);
      }
    };

    doFetch();
    return () => controller.abort();
  }, [entityId, autoFetch, buildUrl, paramsKey]);

  const clearError = useCallback(() => setError(null), []);

  return { data, setData, isLoading, error, refetch, clearError };
}
