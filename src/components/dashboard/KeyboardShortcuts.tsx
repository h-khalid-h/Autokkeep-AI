'use client';

import React, { useEffect, useCallback } from 'react';
import styles from './KeyboardShortcuts.module.css';

// ─── Custom event dispatcher ────────────────────────────────────────────────
const dispatchShortcut = (action: string) => {
  window.dispatchEvent(new CustomEvent('autokkeep-shortcut', { detail: { action } }));
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function KeyboardShortcuts() {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't fire shortcuts when user is typing in an input
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((document.activeElement as HTMLElement)?.isContentEditable) return;

      switch (e.key) {
        case 'a':
        case 'Enter':
          e.preventDefault();
          dispatchShortcut('accept');
          break;
        case 'c':
          e.preventDefault();
          dispatchShortcut('open-category');
          break;
        case 'ArrowUp':
          e.preventDefault();
          dispatchShortcut('navigate-up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          dispatchShortcut('navigate-down');
          break;
        case 'e':
          e.preventDefault();
          dispatchShortcut('toggle-reasoning');
          break;
        case 'Escape':
          dispatchShortcut('close-modal');
          break;
        default:
          break;
      }
    },
    []
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Floating pill to open the global shortcuts help
  return (
    <button
      onClick={() => {
        window.dispatchEvent(new CustomEvent('autokkeep-show-shortcuts'));
      }}
      className={styles.shortcutsPill}
      aria-label="Show keyboard shortcuts"
    >
      <span className={styles.pillKbd}>?</span>
      Shortcuts
    </button>
  );
}
