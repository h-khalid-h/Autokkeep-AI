// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Keyboard Shortcuts Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Defines keyboard shortcut mappings and provides a matcher function
// that resolves keyboard events to shortcut actions.

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ShortcutModifier = 'ctrl' | 'meta' | 'alt' | 'shift';

export interface KeyboardShortcut {
  /** The key to match (lowercase) */
  key: string;
  /** Required modifier keys */
  modifiers: ShortcutModifier[];
  /** Human-readable description */
  description: string;
  /** Action identifier */
  action: string;
  /** Optional: sequence key (for two-key shortcuts like G+D) */
  sequenceKey?: string;
}

// ─── Keyboard Event Subset (for testability) ────────────────────────────────────

export interface KeyboardEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// ─── Default Shortcuts ──────────────────────────────────────────────────────────

export function getDefaultShortcuts(): KeyboardShortcut[] {
  return [
    // Cmd/Ctrl+K — Global search / Command palette
    {
      key: 'k',
      modifiers: ['meta'],
      description: 'Open search / command palette',
      action: 'search',
    },
    {
      key: 'k',
      modifiers: ['ctrl'],
      description: 'Open search / command palette',
      action: 'search',
    },

    // Two-key navigation: G then <key>
    {
      key: 'd',
      modifiers: [],
      description: 'Go to Dashboard',
      action: 'navigate:dashboard',
      sequenceKey: 'g',
    },
    {
      key: 't',
      modifiers: [],
      description: 'Go to Transactions',
      action: 'navigate:transactions',
      sequenceKey: 'g',
    },
    {
      key: 'r',
      modifiers: [],
      description: 'Go to Reports',
      action: 'navigate:reports',
      sequenceKey: 'g',
    },
    {
      key: 'a',
      modifiers: [],
      description: 'Go to Analytics',
      action: 'navigate:analytics',
      sequenceKey: 'g',
    },
    {
      key: 's',
      modifiers: [],
      description: 'Go to Settings',
      action: 'navigate:settings',
      sequenceKey: 'g',
    },
    {
      key: 'n',
      modifiers: [],
      description: 'Go to Notifications',
      action: 'navigate:notifications',
      sequenceKey: 'g',
    },

    // ? — Help modal
    {
      key: '?',
      modifiers: [],
      description: 'Show keyboard shortcuts help',
      action: 'help',
    },
  ];
}

// ─── Matcher ────────────────────────────────────────────────────────────────────

/**
 * Finds the first shortcut matching a keyboard event.
 *
 * @param event - The keyboard event (or event-like object)
 * @param shortcuts - Array of shortcuts to match against
 * @param pendingSequenceKey - If set, only matches shortcuts with this sequenceKey
 * @returns The matching shortcut or null
 */
export function matchShortcut(
  event: KeyboardEventLike,
  shortcuts: KeyboardShortcut[],
  pendingSequenceKey?: string | null
): KeyboardShortcut | null {
  const eventKey = event.key.toLowerCase();

  for (const shortcut of shortcuts) {
    // If we have a pending sequence key, only match shortcuts with that sequence
    if (pendingSequenceKey) {
      if (shortcut.sequenceKey !== pendingSequenceKey) continue;
    } else {
      // No pending sequence — skip sequence shortcuts
      if (shortcut.sequenceKey) continue;
    }

    // Check key match
    if (shortcut.key.toLowerCase() !== eventKey) continue;

    // Check modifiers
    const requiresCtrl = shortcut.modifiers.includes('ctrl');
    const requiresMeta = shortcut.modifiers.includes('meta');
    const requiresAlt = shortcut.modifiers.includes('alt');
    const requiresShift = shortcut.modifiers.includes('shift');

    if (requiresCtrl !== event.ctrlKey) continue;
    if (requiresMeta !== event.metaKey) continue;
    if (requiresAlt !== event.altKey) continue;
    if (requiresShift !== event.shiftKey) continue;

    return shortcut;
  }

  return null;
}
