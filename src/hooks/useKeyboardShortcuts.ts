'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

/* ─── Types ──────────────────────────────────── */
interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Global keyboard shortcuts hook.
 *
 * Supports:
 * - Simple keys: `a`, `Escape`, `?`
 * - Modifier combos: `mod+k`, `mod+b`, `mod+/`
 * - Sequences: `g d` (press g then d within 500ms)
 *
 * `mod` maps to Cmd on macOS and Ctrl on Windows/Linux.
 *
 * Will NOT fire when user is typing in an input, textarea, select,
 * or contentEditable element — unless the key includes a modifier.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const sequenceRef = useRef<string | null>(null);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isEditable = target.isContentEditable;
      const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';

      // Build the key string
      const mod = e.metaKey || e.ctrlKey;
      const parts: string[] = [];
      if (mod) parts.push('mod');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      parts.push(e.key.toLowerCase());
      const keyStr = parts.join('+');

      // Check modifier combos first (these work even in inputs)
      if (mod || e.altKey) {
        const handler = shortcuts[keyStr];
        if (handler) {
          e.preventDefault();
          e.stopPropagation();
          handler();
          return;
        }
      }

      // Skip non-modifier shortcuts when in an input
      if (isInput || isEditable) return;

      // Check for sequence shortcuts (e.g., "g d")
      if (sequenceRef.current) {
        const seqKey = `${sequenceRef.current} ${e.key.toLowerCase()}`;
        sequenceRef.current = null;
        if (sequenceTimerRef.current) {
          clearTimeout(sequenceTimerRef.current);
          sequenceTimerRef.current = null;
        }
        const handler = shortcuts[seqKey];
        if (handler) {
          e.preventDefault();
          handler();
          return;
        }
      }

      // Check if this key starts a sequence
      const isSequenceStart = Object.keys(shortcuts).some(
        (k) => k.startsWith(`${e.key.toLowerCase()} `) && k.includes(' ')
      );

      if (isSequenceStart) {
        sequenceRef.current = e.key.toLowerCase();
        sequenceTimerRef.current = setTimeout(() => {
          sequenceRef.current = null;
        }, 500);
        return;
      }

      // Check direct key shortcuts
      const handler = shortcuts[keyStr];
      if (handler) {
        e.preventDefault();
        handler();
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimerRef.current) {
        clearTimeout(sequenceTimerRef.current);
      }
    };
  }, [handleKeyDown]);
}

/* ─── Pre-built navigation shortcuts hook ────── */
export function useNavigationShortcuts() {
  const router = useRouter();

  const shortcuts: ShortcutMap = {
    // Sequence shortcuts: press g then a letter
    'g d': () => router.push('/dashboard'),
    'g t': () => router.push('/transactions'),
    'g i': () => router.push('/insights'),
    'g c': () => router.push('/close'),
    'g h': () => router.push('/health'),
    'g x': () => router.push('/tax'),
    'g a': () => router.push('/analytics'),
    'g l': () => router.push('/chart-of-accounts'),
    'g p': () => router.push('/portfolio'),
    'g s': () => router.push('/settings'),

    // Modifier shortcuts
    'mod+b': () => {
      // Toggle sidebar — dispatch custom event
      window.dispatchEvent(new CustomEvent('autokkeep-toggle-sidebar'));
    },
    'mod+/': () => {
      // Show shortcuts help — dispatch custom event
      window.dispatchEvent(new CustomEvent('autokkeep-show-shortcuts'));
    },

    // Quick access
    '?': () => {
      window.dispatchEvent(new CustomEvent('autokkeep-show-shortcuts'));
    },
  };

  useKeyboardShortcuts(shortcuts);
}
