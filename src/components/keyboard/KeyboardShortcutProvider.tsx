'use client';

import { useEffect, useCallback, useState, useRef, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import {
  getDefaultShortcuts,
  matchShortcut,
  type KeyboardShortcut,
} from '@/lib/keyboard/shortcuts';
import styles from './keyboard-shortcuts.module.css';

// ─── Context ────────────────────────────────────────────────────────────────────

interface KeyboardShortcutContextValue {
  shortcuts: KeyboardShortcut[];
  showHelp: () => void;
  hideHelp: () => void;
  isHelpOpen: boolean;
}

const KeyboardShortcutContext = createContext<KeyboardShortcutContextValue>({
  shortcuts: [],
  showHelp: () => {},
  hideHelp: () => {},
  isHelpOpen: false,
});

export function useKeyboardShortcuts() {
  return useContext(KeyboardShortcutContext);
}

// ─── Navigation Map ─────────────────────────────────────────────────────────────

const NAVIGATION_MAP: Record<string, string> = {
  'navigate:dashboard': '/dashboard',
  'navigate:transactions': '/transactions',
  'navigate:reports': '/reports',
  'navigate:analytics': '/insights',
  'navigate:settings': '/settings',
  'navigate:notifications': '/notifications',
};

// ─── Provider ───────────────────────────────────────────────────────────────────

interface KeyboardShortcutProviderProps {
  children: React.ReactNode;
  onSearch?: () => void;
}

export function KeyboardShortcutProvider({ children, onSearch }: KeyboardShortcutProviderProps) {
  const router = useRouter();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const pendingKeyRef = useRef<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortcuts = getDefaultShortcuts();

  const showHelp = useCallback(() => setIsHelpOpen(true), []);
  const hideHelp = useCallback(() => setIsHelpOpen(false), []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Check for sequence start (G key)
      if (event.key.toLowerCase() === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        pendingKeyRef.current = 'g';
        // Clear after 1 second
        if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = setTimeout(() => {
          pendingKeyRef.current = null;
        }, 1000);
        return;
      }

      const matched = matchShortcut(
        event,
        shortcuts,
        pendingKeyRef.current
      );

      // Clear pending key
      pendingKeyRef.current = null;
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }

      if (!matched) return;

      event.preventDefault();
      event.stopPropagation();

      // Handle actions
      if (matched.action === 'search') {
        onSearch?.();
      } else if (matched.action === 'help') {
        setIsHelpOpen((prev) => !prev);
      } else if (matched.action.startsWith('navigate:')) {
        const path = NAVIGATION_MAP[matched.action];
        if (path) router.push(path);
      }
    },
    [shortcuts, onSearch, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, []);

  return (
    <KeyboardShortcutContext.Provider value={{ shortcuts, showHelp, hideHelp, isHelpOpen }}>
      {children}

      {/* Help Modal */}
      {isHelpOpen && (
        <div
          className={styles.overlay}
          onClick={hideHelp}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts help"
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>⌨️ Keyboard Shortcuts</h2>
              <button
                className={styles.closeButton}
                onClick={hideHelp}
                aria-label="Close shortcuts help"
              >
                ✕
              </button>
            </div>

            <div className={styles.shortcutsList}>
              {/* General shortcuts */}
              <div className={styles.shortcutGroup}>
                <h3 className={styles.groupTitle}>General</h3>
                <ShortcutRow keys={['⌘', 'K']} description="Open search / command palette" />
                <ShortcutRow keys={['?']} description="Show keyboard shortcuts" />
              </div>

              {/* Navigation shortcuts */}
              <div className={styles.shortcutGroup}>
                <h3 className={styles.groupTitle}>Navigation</h3>
                <ShortcutRow keys={['G', 'D']} description="Go to Dashboard" />
                <ShortcutRow keys={['G', 'T']} description="Go to Transactions" />
                <ShortcutRow keys={['G', 'R']} description="Go to Reports" />
                <ShortcutRow keys={['G', 'A']} description="Go to Analytics" />
                <ShortcutRow keys={['G', 'S']} description="Go to Settings" />
                <ShortcutRow keys={['G', 'N']} description="Go to Notifications" />
              </div>

              {/* Command palette shortcuts */}
              <div className={styles.shortcutGroup}>
                <h3 className={styles.groupTitle}>Command Palette</h3>
                <ShortcutRow keys={['↑', '↓']} description="Navigate results" />
                <ShortcutRow keys={['Enter']} description="Open selected result" />
                <ShortcutRow keys={['Esc']} description="Close palette" />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <span className={styles.footerHint}>
                Press <kbd className={styles.kbd}>?</kbd> to toggle this dialog
              </span>
            </div>
          </div>
        </div>
      )}
    </KeyboardShortcutContext.Provider>
  );
}

// ─── Shortcut Row Component ─────────────────────────────────────────────────────

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className={styles.shortcutRow}>
      <div className={styles.shortcutKeys}>
        {keys.map((key, i) => (
          <span key={i}>
            <kbd className={styles.kbd}>{key}</kbd>
            {i < keys.length - 1 && <span className={styles.keyPlus}>+</span>}
          </span>
        ))}
      </div>
      <span className={styles.shortcutDescription}>{description}</span>
    </div>
  );
}
