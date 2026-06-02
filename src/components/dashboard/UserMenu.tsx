'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import styles from './UserMenu.module.css';

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

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedIndex(() => 0);
    } else {
      setFocusedIndex(() => -1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const MENU_ITEM_COUNT = 4;

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
    <div ref={menuRef} className={styles.menuWrapper}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={styles.avatarBtn}
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {userInitials}
      </button>

      {isOpen && (
        <div
          className={styles.dropdown}
          role="menu"
          onKeyDown={handleKeyDown}
        >
          {/* User Info */}
          <div className={styles.userInfo}>
            <div className={styles.userName}>{userEmail || 'User'}</div>
            <div className={styles.userStatus}>Signed in</div>
          </div>

          {/* Menu Items */}
          <div className={styles.menuItems}>
            <Link
              href="/settings"
              role="menuitem"
              tabIndex={-1}
              ref={(el) => { itemRefs.current[0] = el; }}
              className={styles.menuItem}
            >
              ⚙️ Settings
            </Link>
            <Link
              href="/account"
              role="menuitem"
              tabIndex={-1}
              ref={(el) => { itemRefs.current[1] = el; }}
              className={styles.menuItem}
            >
              👤 Account
            </Link>
            <Link
              href="/analytics"
              role="menuitem"
              tabIndex={-1}
              ref={(el) => { itemRefs.current[2] = el; }}
              className={styles.menuItem}
            >
              📊 Analytics
            </Link>
          </div>

          {/* Logout */}
          <div className={styles.logoutSection}>
            <button
              role="menuitem"
              tabIndex={-1}
              ref={(el) => { itemRefs.current[3] = el; }}
              onClick={handleLogout}
              disabled={loggingOut}
              className={styles.logoutBtn}
            >
              {loggingOut ? '⏳ Signing out...' : '🚪 Sign Out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
