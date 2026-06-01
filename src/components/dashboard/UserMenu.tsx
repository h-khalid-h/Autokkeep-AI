'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient();
  }
  return _supabase;
}

interface UserMenuProps {
  initials?: string;
  email?: string;
}

export default function UserMenu({ initials: propsInitials, email: propsEmail }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [userInitials, setUserInitials] = useState(propsInitials || 'AK');
  const [userEmail, setUserEmail] = useState(propsEmail || '');
  const [loggingOut, setLoggingOut] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (propsInitials && propsEmail) return;
    async function loadUser() {
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
          const parts = user.email.split('@')[0].split(/[._-]/);
          setUserInitials(
            parts.length >= 2
              ? (parts[0][0] + parts[1][0]).toUpperCase()
              : user.email.slice(0, 2).toUpperCase()
          );
        }
      } catch { /* fallback to defaults */ }
    }
    loadUser();
  }, [propsInitials, propsEmail]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      const supabase = getSupabase();
      await supabase.auth.signOut();
      window.location.href = '/auth/login';
    } catch {
      setLoggingOut(false);
    }
  }, []);

  // Focus management when dropdown opens/closes
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedIndex(() => 0);
    } else {
      setFocusedIndex(() => -1);
    }
  }, [isOpen]);

  // Focus the active item when focusedIndex changes
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const MENU_ITEM_COUNT = 4; // Settings, Account, Analytics, Sign Out

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % MENU_ITEM_COUNT);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + MENU_ITEM_COUNT) % MENU_ITEM_COUNT);
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
          itemRefs.current[focusedIndex]?.click();
        }
        break;
    }
  }, [focusedIndex]);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="slack-avatar"
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        style={{ cursor: 'pointer', border: 'none' }}
      >
        {userInitials}
      </button>

      {isOpen && (
        <div
          role="menu"
          onKeyDown={handleKeyDown}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: '220px',
            background: 'var(--bg-surface, #1a1a2e)',
            border: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            overflow: 'hidden',
            zIndex: 1000,
            animation: 'menuFadeIn 0.15s ease-out',
          }}
        >
          {/* User Info */}
          <div
            style={{
              padding: '16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '2px',
            }}>
              {userEmail || 'User'}
            </div>
            <div style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}>
              Signed in
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ padding: '4px' }}>
            <a
              href="/settings"
              role="menuitem"
              tabIndex={-1}
              ref={(el) => { itemRefs.current[0] = el; }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                fontSize: '13px',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              ⚙️ Settings
            </a>
            <a
              href="/account"
              role="menuitem"
              tabIndex={-1}
              ref={(el) => { itemRefs.current[1] = el; }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                fontSize: '13px',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              👤 Account
            </a>
            <a
              href="/analytics"
              role="menuitem"
              tabIndex={-1}
              ref={(el) => { itemRefs.current[2] = el; }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                fontSize: '13px',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              📊 Analytics
            </a>
          </div>

          {/* Logout */}
          <div style={{ padding: '4px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              role="menuitem"
              tabIndex={-1}
              ref={(el) => { itemRefs.current[3] = el; }}
              onClick={handleLogout}
              disabled={loggingOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                color: 'var(--destructive)',
                fontSize: '13px',
                width: '100%',
                border: 'none',
                background: 'transparent',
                cursor: loggingOut ? 'wait' : 'pointer',
                transition: 'background 0.15s ease',
                opacity: loggingOut ? 0.6 : 1,
              }}
              onMouseEnter={(e) => !loggingOut && (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {loggingOut ? '⏳ Signing out...' : '🚪 Sign Out'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes menuFadeIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
