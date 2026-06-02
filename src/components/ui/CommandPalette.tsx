'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import styles from './CommandPalette.module.css';

/* ─── Types ──────────────────────────────────── */
interface CommandItem {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  action?: () => void;
  group: string;
  keywords?: string[];
  shortcut?: string[];
}

interface CommandPaletteProps {
  /** Additional commands to register */
  extraCommands?: CommandItem[];
}

/* ─── Default commands ───────────────────────── */
const defaultCommands: CommandItem[] = [
  // Navigation
  { id: 'nav-dashboard', label: 'Go to Dashboard', icon: '⚡', href: '/dashboard', group: 'Navigation', keywords: ['home', 'main'] },
  { id: 'nav-transactions', label: 'Go to Transactions', icon: '📋', href: '/transactions', group: 'Navigation', keywords: ['tx', 'payments'] },
  { id: 'nav-insights', label: 'Go to AI Insights', icon: '🧠', href: '/insights', group: 'Navigation', keywords: ['ai', 'chat', 'ask'] },
  { id: 'nav-close', label: 'Go to Month-End Close', icon: '📊', href: '/close', group: 'Navigation', keywords: ['month', 'close', 'period'] },
  { id: 'nav-health', label: 'Go to Financial Health', icon: '💚', href: '/health', group: 'Navigation', keywords: ['health', 'alerts'] },
  { id: 'nav-tax', label: 'Go to Tax Hub', icon: '🏛️', href: '/tax', group: 'Navigation', keywords: ['tax', 'deductions'] },
  { id: 'nav-portfolio', label: 'Go to Portfolio', icon: '🏢', href: '/portfolio', group: 'Navigation', keywords: ['entities', 'companies'] },
  { id: 'nav-analytics', label: 'Go to Analytics', icon: '📈', href: '/analytics', group: 'Navigation', keywords: ['charts', 'reports'] },
  { id: 'nav-gl', label: 'Go to Chart of Accounts', icon: '📒', href: '/chart-of-accounts', group: 'Navigation', keywords: ['gl', 'accounts', 'ledger'] },
  { id: 'nav-settings', label: 'Go to Settings', icon: '⚙️', href: '/settings', group: 'Navigation', keywords: ['config', 'preferences'] },
  { id: 'nav-account', label: 'Go to Account', icon: '👤', href: '/account', group: 'Navigation', keywords: ['profile', 'user'] },
];

/* ─── Fuzzy search ───────────────────────────── */
function fuzzyMatch(query: string, item: CommandItem): boolean {
  const q = query.toLowerCase();
  const targets = [item.label, ...(item.keywords || [])];
  return targets.some(t => t.toLowerCase().includes(q));
}

/* ─── Component ──────────────────────────────── */
export function CommandPalette({ extraCommands = [] }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const allCommands = useMemo(
    () => [...defaultCommands, ...extraCommands],
    [extraCommands]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    return allCommands.filter(item => fuzzyMatch(query, item));
  }, [query, allCommands]);

  // Group results
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [filtered]);

  // Flat list for keyboard nav
  const flatList = useMemo(() => filtered, [filtered]);

  // Open/close handlers
  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  // Execute a command
  const executeItem = useCallback((item: CommandItem) => {
    close();
    if (item.href) {
      router.push(item.href);
    } else if (item.action) {
      item.action();
    }
  }, [close, router]);

  // ⌘K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          close();
        } else {
          open();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, open, close]);

  // Listen for custom event from TopBar search trigger
  useEffect(() => {
    const handler = () => open();
    window.addEventListener('autokkeep-command-palette', handler);
    return () => window.removeEventListener('autokkeep-command-palette', handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatList[activeIndex]) {
          executeItem(flatList[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }, [flatList, activeIndex, executeItem, close]);

  // Scroll active item into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const activeEl = container.querySelector(`[data-index="${activeIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);




  if (!isOpen) return null;

  let globalIndex = 0;

  return (
    <div className={styles.overlay} onClick={close} role="dialog" aria-modal="true" aria-label="Command palette">
      <div
        className={styles.palette}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search */}
        <div className={styles.searchContainer}>
          <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className={styles.searchInput}
            placeholder="Search commands, pages..."
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            aria-label="Search commands"
            autoComplete="off"
            spellCheck="false"
          />
          <kbd className={styles.searchKbd}>ESC</kbd>
        </div>

        {/* Results */}
        <div className={styles.results} ref={resultsRef}>
          {flatList.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>🔍</div>
              <p>No results for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className={styles.group}>
                <div className={styles.groupLabel}>{group}</div>
                {items.map(item => {
                  const idx = globalIndex++;
                  return (
                    <button
                      key={item.id}
                      className={`${styles.item} ${idx === activeIndex ? styles.active : ''}`}
                      onClick={() => executeItem(item)}
                      data-index={idx}
                      role="option"
                      aria-selected={idx === activeIndex}
                    >
                      {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                      <span className={styles.itemLabel}>{item.label}</span>
                      {item.shortcut && (
                        <span className={styles.itemShortcut}>
                          {item.shortcut.map((k, i) => (
                            <kbd key={i} className={styles.searchKbd}>{k}</kbd>
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className={styles.footer}>
          <div className={styles.footerHints}>
            <span className={styles.hint}>
              <kbd className={styles.searchKbd}>↑↓</kbd> Navigate
            </span>
            <span className={styles.hint}>
              <kbd className={styles.searchKbd}>↵</kbd> Select
            </span>
            <span className={styles.hint}>
              <kbd className={styles.searchKbd}>ESC</kbd> Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { CommandItem, CommandPaletteProps };
