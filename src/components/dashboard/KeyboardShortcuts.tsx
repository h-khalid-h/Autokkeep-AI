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
          bottom: 'var(--space-5)',
          right: 'var(--space-5)',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-4)',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-elevated)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          opacity: 0.7,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '1';
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            'var(--accent-primary)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 0 16px rgba(var(--accent-glow-rgb), 0.2)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '0.7';
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            'var(--border-primary)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-secondary)',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-primary)',
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
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '420px',
              maxWidth: '90vw',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--border-secondary)',
              background: 'var(--bg-secondary)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              padding: 'var(--space-6)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 40px rgba(var(--accent-glow-rgb), 0.08)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-5)',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
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
                  color: 'var(--text-secondary)',
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
                    padding: 'var(--space-3) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass)',
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
                          minWidth: '30px',
                          height: '30px',
                          padding: '0 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
                          border: '1px solid var(--border-secondary)',
                          borderBottom: '2px solid var(--border-secondary)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
                          fontSize: '12px',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--accent-secondary)',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {k.trim()}
                      </kbd>
                    ))}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
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
                marginTop: 'var(--space-4)',
                marginBottom: 0,
                fontSize: '11px',
                color: 'var(--text-tertiary)',
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
