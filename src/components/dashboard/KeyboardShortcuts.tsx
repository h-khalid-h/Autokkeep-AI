'use client';

import React, { useEffect, useState, useCallback } from 'react';

// ─── Custom event dispatcher ────────────────────────────────────────────────
const dispatchShortcut = (action: string) => {
  window.dispatchEvent(new CustomEvent('autokkeep-shortcut', { detail: { action } }));
};

// ─── Shortcut definitions ───────────────────────────────────────────────────
const SHORTCUTS = [
  { key: 'A / Enter', action: 'Accept current transaction' },
  { key: 'C', action: 'Open category picker' },
  { key: '↑', action: 'Previous transaction' },
  { key: '↓', action: 'Next transaction' },
  { key: 'E', action: 'Toggle AI reasoning panel' },
  { key: '?', action: 'Show/hide this help' },
  { key: 'Esc', action: 'Close modal / dropdown' },
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't fire shortcuts when user is typing in an input
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      // Also skip if activeElement is contentEditable
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
        case '?':
          e.preventDefault();
          setShowHelp((prev) => !prev);
          break;
        case 'Escape':
          if (showHelp) {
            e.preventDefault();
            setShowHelp(false);
          } else {
            dispatchShortcut('close-modal');
          }
          break;
        default:
          break;
      }
    },
    [showHelp]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* ── Floating "? Shortcuts" pill ─────────────────────────────────── */}
      <button
        onClick={() => setShowHelp((prev) => !prev)}
        aria-label="Show keyboard shortcuts"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          background: 'var(--surface-2, rgba(30,30,30,0.85))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: 'var(--text-secondary, #999)',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          opacity: 0.7,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '1';
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            'var(--brand, #6C5CE7)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '0.7';
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            'var(--border-subtle, rgba(255,255,255,0.08))';
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            borderRadius: '6px',
            background: 'var(--surface-3, rgba(255,255,255,0.06))',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-primary, #fff)',
          }}
        >
          ?
        </span>
        Shortcuts
      </button>

      {/* ── Help modal ─────────────────────────────────────────────────── */}
      {showHelp && (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          onClick={() => setShowHelp(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '420px',
              maxWidth: '90vw',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
              background: 'var(--surface-1, rgba(25,25,35,0.95))',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              padding: '24px',
              boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--text-primary, #fff)',
                }}
              >
                ⌨️ Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowHelp(false)}
                aria-label="Close shortcuts dialog"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary, #999)',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '4px',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Shortcuts table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {SHORTCUTS.map((s) => (
                <div
                  key={s.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface-2, rgba(255,255,255,0.03))',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      gap: '4px',
                    }}
                  >
                    {s.key.split(' / ').map((k) => (
                      <kbd
                        key={k}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '28px',
                          height: '28px',
                          padding: '0 8px',
                          borderRadius: '6px',
                          background: 'var(--surface-3, rgba(255,255,255,0.08))',
                          border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                          fontSize: '12px',
                          fontWeight: 600,
                          fontFamily: 'inherit',
                          color: 'var(--text-primary, #fff)',
                        }}
                      >
                        {k.trim()}
                      </kbd>
                    ))}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary, #999)',
                    }}
                  >
                    {s.action}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <p
              style={{
                marginTop: '16px',
                marginBottom: 0,
                fontSize: '11px',
                color: 'var(--text-tertiary, #666)',
                textAlign: 'center',
              }}
            >
              Shortcuts are disabled when typing in input fields
            </p>
          </div>
        </div>
      )}
    </>
  );
}
