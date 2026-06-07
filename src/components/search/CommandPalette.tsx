'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchResult } from '@/lib/search/engine';
import styles from './command-palette.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Type Icons ─────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  transaction: '💳',
  vendor: '🏢',
  category: '🏷️',
};

const TYPE_LABELS: Record<string, string> = {
  transaction: 'Transactions',
  vendor: 'Vendors',
  category: 'Categories',
};

// ─── Command Palette Component ──────────────────────────────────────────────────

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // ── Focus input on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting state when modal opens
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      // Delay to ensure DOM is ready
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // ── Close on Escape ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // ── Debounced search ────────────────────────────────────────────────────
  const performSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=20`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(data.results || []);
      setSelectedIndex(0);
    } catch (err) {
      console.error('[CommandPalette] Search error:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        performSearch(value);
      }, 300);
    },
    [performSearch]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Navigate to result ──────────────────────────────────────────────────
  const navigateToResult = useCallback(
    (result: SearchResult) => {
      onClose();
      router.push(result.url);
    },
    [onClose, router]
  );

  // ── Keyboard navigation ────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        // Scroll into view
        requestAnimationFrame(() => {
          const el = resultsRef.current?.querySelector(`[data-index="${Math.min(selectedIndex + 1, results.length - 1)}"]`);
          el?.scrollIntoView({ block: 'nearest' });
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        requestAnimationFrame(() => {
          const el = resultsRef.current?.querySelector(`[data-index="${Math.max(selectedIndex - 1, 0)}"]`);
          el?.scrollIntoView({ block: 'nearest' });
        });
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        navigateToResult(results[selectedIndex]);
      }
    },
    [results, selectedIndex, navigateToResult]
  );

  // ── Group results by type ───────────────────────────────────────────────
  const groupedResults: Record<string, SearchResult[]> = {};
  for (const result of results) {
    if (!groupedResults[result.type]) {
      groupedResults[result.type] = [];
    }
    groupedResults[result.type].push(result);
  }

  // Track flat index for keyboard navigation
  let flatIndex = 0;

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className={styles.inputWrapper}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            ref={inputRef}
            className={styles.searchInput}
            type="text"
            placeholder="Search transactions, vendors, categories..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          {isLoading && <span className={styles.spinner} />}
          <kbd className={styles.escHint}>Esc</kbd>
        </div>

        {/* Results */}
        <div className={styles.results} ref={resultsRef}>
          {/* Empty state — no query */}
          {!query.trim() && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>⌨️</span>
              <p className={styles.emptyText}>
                Start typing to search across your workspace
              </p>
              <div className={styles.emptyHints}>
                <span><kbd className={styles.kbdSmall}>↑↓</kbd> Navigate</span>
                <span><kbd className={styles.kbdSmall}>↵</kbd> Open</span>
                <span><kbd className={styles.kbdSmall}>Esc</kbd> Close</span>
              </div>
            </div>
          )}

          {/* Empty state — no results */}
          {query.trim().length >= 2 && !isLoading && results.length === 0 && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🔍</span>
              <p className={styles.emptyText}>
                No results found for &quot;{query}&quot;
              </p>
            </div>
          )}

          {/* Grouped results */}
          {Object.entries(groupedResults).map(([type, items]) => (
            <div key={type} className={styles.resultGroup}>
              <div className={styles.groupHeader}>
                <span className={styles.groupIcon}>{TYPE_ICONS[type] || '📄'}</span>
                <span className={styles.groupLabel}>{TYPE_LABELS[type] || type}</span>
                <span className={styles.groupCount}>{items.length}</span>
              </div>
              {items.map((result) => {
                const currentIndex = flatIndex++;
                return (
                  <button
                    key={result.id}
                    data-index={currentIndex}
                    className={
                      currentIndex === selectedIndex
                        ? styles.resultItemSelected
                        : styles.resultItem
                    }
                    onClick={() => navigateToResult(result)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                    aria-label={`${result.title} — ${result.subtitle}`}
                  >
                    <div className={styles.resultContent}>
                      <span className={styles.resultTitle}>{result.title}</span>
                      <span className={styles.resultSubtitle}>{result.subtitle}</span>
                    </div>
                    <span className={styles.resultArrow}>→</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className={styles.footer}>
            <span className={styles.footerHint}>
              <kbd className={styles.kbdSmall}>↑↓</kbd> Navigate
              <kbd className={styles.kbdSmall}>↵</kbd> Open
              <kbd className={styles.kbdSmall}>Esc</kbd> Close
            </span>
            <span className={styles.footerCount}>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
