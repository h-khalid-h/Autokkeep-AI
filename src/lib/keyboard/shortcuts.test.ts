import { describe, it, expect } from 'vitest';
import {
  getDefaultShortcuts,
  matchShortcut,
  type KeyboardEventLike,
  type KeyboardShortcut,
} from '@/lib/keyboard/shortcuts';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createEvent(overrides: Partial<KeyboardEventLike>): KeyboardEventLike {
  return {
    key: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Keyboard Shortcuts Engine', () => {
  describe('getDefaultShortcuts', () => {
    it('should return an array of default shortcuts', () => {
      const shortcuts = getDefaultShortcuts();
      expect(Array.isArray(shortcuts)).toBe(true);
      expect(shortcuts.length).toBeGreaterThanOrEqual(8);
    });

    it('should include Cmd+K search shortcut', () => {
      const shortcuts = getDefaultShortcuts();
      const search = shortcuts.find(
        (s) => s.action === 'search' && s.modifiers.includes('meta')
      );
      expect(search).toBeDefined();
      expect(search!.key).toBe('k');
    });

    it('should include help shortcut with ? key', () => {
      const shortcuts = getDefaultShortcuts();
      const help = shortcuts.find((s) => s.action === 'help');
      expect(help).toBeDefined();
      expect(help!.key).toBe('?');
    });

    it('should include G+D navigation shortcut', () => {
      const shortcuts = getDefaultShortcuts();
      const gd = shortcuts.find(
        (s) => s.action === 'navigate:dashboard' && s.sequenceKey === 'g'
      );
      expect(gd).toBeDefined();
      expect(gd!.key).toBe('d');
    });
  });

  describe('matchShortcut', () => {
    const shortcuts = getDefaultShortcuts();

    it('should match Cmd+K to search action', () => {
      const event = createEvent({ key: 'k', metaKey: true });
      const result = matchShortcut(event, shortcuts);
      expect(result).not.toBeNull();
      expect(result!.action).toBe('search');
    });

    it('should match Ctrl+K to search action', () => {
      const event = createEvent({ key: 'k', ctrlKey: true });
      const result = matchShortcut(event, shortcuts);
      expect(result).not.toBeNull();
      expect(result!.action).toBe('search');
    });

    it('should not match plain K without modifiers', () => {
      const event = createEvent({ key: 'k' });
      const result = matchShortcut(event, shortcuts);
      // Should NOT match search (which requires meta/ctrl)
      // Might match a sequence shortcut but without pending key it shouldn't
      expect(result?.action).not.toBe('search');
    });

    it('should match ? to help action', () => {
      const event = createEvent({ key: '?' });
      const result = matchShortcut(event, shortcuts);
      expect(result).not.toBeNull();
      expect(result!.action).toBe('help');
    });

    it('should match G+D sequence for dashboard navigation', () => {
      const event = createEvent({ key: 'd' });
      const result = matchShortcut(event, shortcuts, 'g');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('navigate:dashboard');
    });

    it('should not match D without pending G sequence', () => {
      const event = createEvent({ key: 'd' });
      const result = matchShortcut(event, shortcuts);
      // Without pending 'g', sequence shortcuts should not match
      expect(result?.action).not.toBe('navigate:dashboard');
    });

    it('should return null for unrecognized keys', () => {
      const event = createEvent({ key: 'z', ctrlKey: true, metaKey: true });
      const result = matchShortcut(event, shortcuts);
      expect(result).toBeNull();
    });

    it('should work with custom shortcut arrays', () => {
      const custom: KeyboardShortcut[] = [
        { key: 'x', modifiers: ['alt'], description: 'Custom action', action: 'custom' },
      ];
      const event = createEvent({ key: 'x', altKey: true });
      const result = matchShortcut(event, custom);
      expect(result).not.toBeNull();
      expect(result!.action).toBe('custom');
    });
  });
});
