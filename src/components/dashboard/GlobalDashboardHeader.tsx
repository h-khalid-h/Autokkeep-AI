'use client';

import React from 'react';
import Link from 'next/link';
import { createClient as getSupabase } from '@/lib/supabase/client';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { useEntity } from '@/lib/context/EntityContext';
import Logo from '@/components/ui/Logo';
import UserMenu from './UserMenu';
import NotificationBell from './NotificationBell';

const NAV_LINKS = [
  { href: '/insights', icon: '🧠', label: 'Insights' },
  { href: '/health', icon: '💚', label: 'Health' },
  { href: '/close', icon: '📅', label: 'Close' },
  { href: '/tax', icon: '📋', label: 'Tax' },
  { href: '/portfolio', icon: '📊', label: 'Portfolio' },
  { href: '/analytics', icon: '📈', label: 'Analytics' },
  { href: '/transactions', icon: '📋', label: 'History' },
  { href: '/chart-of-accounts', icon: '📒', label: 'GL Codes' },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
] as const;

const GlobalDashboardHeader: React.FC = () => {
  const { entities, selectedEntity, setSelectedEntityId } = useEntity();
  const [isEntityDropdownOpen, setIsEntityDropdownOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [userInitials, setUserInitials] = React.useState('AK');
  const [connectionStatus, setConnectionStatus] = React.useState('Connecting...');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    async function loadData() {
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const email = user.email || '';
          const parts = email.split('@')[0].split(/[._-]/);
          const initials = parts.length >= 2
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : email.slice(0, 2).toUpperCase();
          setUserInitials(initials);
        } else {
          setConnectionStatus('Not Logged In');
        }
      } catch {
        setConnectionStatus('Demo Mode');
      }
    }

    loadData();
  }, []);

  React.useEffect(() => {
    async function loadConnectionStatus() {
      if (!selectedEntity) {
        setConnectionStatus(entities.length === 0 ? 'Setup Required' : 'Connecting...');
        return;
      }

      try {
        const supabase = getSupabase();
        const db = supabase as unknown as SupabaseQueryClient;
        const { data: bankConns } = await db
          .from('bank_connections')
          .select('id, status')
          .eq('entity_id', selectedEntity.id)
          .eq('status', 'active');

        setConnectionStatus(
          bankConns && bankConns.length > 0
            ? 'Live · Plaid Connected'
            : 'No Bank Connected'
        );
      } catch {
        setConnectionStatus('Demo Mode');
      }
    }

    loadConnectionStatus();
  }, [selectedEntity, entities.length]);

  const toggleDropdown = React.useCallback(() => {
    setIsEntityDropdownOpen((prev) => !prev);
  }, []);

  const selectEntity = React.useCallback((entity: { id: string; name: string }) => {
    setSelectedEntityId(entity.id);
    setIsEntityDropdownOpen(false);
  }, [setSelectedEntityId]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsEntityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on route navigation (link click)
  const closeMobileMenu = React.useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const displayName = selectedEntity?.name || 'No Entity';
  const isLive = connectionStatus.includes('Live');

  return (
    <>
      <style jsx>{`
        .mobile-hamburger {
          display: none;
          background: none;
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 22px;
          cursor: pointer;
          color: var(--text-primary);
          line-height: 1;
        }
        .mobile-menu-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 999;
        }
        .mobile-menu-drawer {
          display: none;
          position: fixed;
          top: 0;
          right: 0;
          width: 280px;
          max-width: 85vw;
          height: 100vh;
          background: var(--bg-primary);
          border-left: 1px solid var(--border-primary);
          z-index: 1000;
          flex-direction: column;
          padding: 0;
          overflow-y: auto;
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.2);
        }
        .mobile-menu-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-primary);
        }
        .mobile-menu-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: var(--text-primary);
          padding: 4px 8px;
          border-radius: 6px;
          line-height: 1;
        }
        .mobile-menu-close:hover {
          background: var(--bg-secondary);
        }
        .mobile-menu-links {
          display: flex;
          flex-direction: column;
          padding: 12px 0;
        }
        .mobile-menu-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          color: var(--text-primary);
          text-decoration: none;
          font-size: 15px;
          font-weight: 500;
          transition: background 0.15s ease;
        }
        .mobile-menu-link:hover {
          background: var(--bg-secondary);
        }
        .mobile-menu-footer {
          margin-top: auto;
          padding: 16px 20px;
          border-top: 1px solid var(--border-primary);
        }
        @media (max-width: 768px) {
          .mobile-hamburger {
            display: flex;
            align-items: center;
          }
          .desktop-nav-items {
            display: none !important;
          }
          .mobile-menu-overlay[data-open="true"] {
            display: block;
          }
          .mobile-menu-drawer[data-open="true"] {
            display: flex;
          }
        }
      `}</style>
      <header className="dashboard-header" role="banner">
        {/* Logo */}
        <div className="navbar-logo">
          <Logo size={32} />
          <span className="text-gradient">Autokkeep</span>
        </div>

        {/* Center section: Entity Switcher */}
        <div ref={dropdownRef} className="category-search">
          <button
            className="btn btn-secondary"
            onClick={toggleDropdown}
            aria-haspopup="listbox"
            aria-expanded={isEntityDropdownOpen}
            aria-label={`Selected entity: ${displayName}`}
            disabled={entities.length === 0}
          >
            <span aria-hidden="true">🏢</span>
            {displayName}
            {entities.length > 1 && (
              <span aria-hidden="true">{isEntityDropdownOpen ? '▲' : '▼'}</span>
            )}
          </button>
          {isEntityDropdownOpen && entities.length > 1 && (
            <ul
              className="category-search-dropdown"
              role="listbox"
              aria-label="Entity selection"
            >
              {entities.map((entity) => (
                <li
                  key={entity.id}
                  className="category-option"
                  role="option"
                  aria-selected={entity.id === selectedEntity?.id}
                  onClick={() => selectEntity(entity)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') selectEntity(entity);
                  }}
                  tabIndex={0}
                >
                  <span className="category-option-code" aria-hidden="true">
                    🏢
                  </span>
                  {entity.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right section: Nav + Live status + Avatar */}
        <nav className="navbar-actions" aria-label="Dashboard actions">
          {/* Desktop nav links */}
          <span className="desktop-nav-items" style={{ display: 'contents' }}>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="btn btn-ghost btn-sm"
                style={{ textDecoration: 'none' }}
              >
                {link.icon} {link.label}
              </Link>
            ))}
          </span>
          <span
            className={`pill ${isLive ? 'pill-live' : ''}`}
            aria-label={`Connection status: ${connectionStatus}`}
          >
            {connectionStatus}
          </span>
          <NotificationBell />
          <UserMenu initials={userInitials} />

          {/* Mobile hamburger button */}
          <button
            className="mobile-hamburger"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            ☰
          </button>
        </nav>
      </header>

      {/* Mobile menu overlay */}
      <div
        className="mobile-menu-overlay"
        data-open={mobileMenuOpen ? 'true' : 'false'}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />
      {/* Mobile menu drawer */}
      <nav
        className="mobile-menu-drawer"
        data-open={mobileMenuOpen ? 'true' : 'false'}
        aria-label="Mobile navigation"
        role="navigation"
      >
        <div className="mobile-menu-header">
          <span className="text-gradient" style={{ fontSize: '16px', fontWeight: 700 }}>
            Navigation
          </span>
          <button
            className="mobile-menu-close"
            onClick={closeMobileMenu}
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>
        <div className="mobile-menu-links">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="mobile-menu-link"
              onClick={closeMobileMenu}
            >
              <span aria-hidden="true">{link.icon}</span>
              {link.label}
            </Link>
          ))}
        </div>
        <div className="mobile-menu-footer">
          <span
            className={`pill ${isLive ? 'pill-live' : ''}`}
            aria-label={`Connection status: ${connectionStatus}`}
            style={{ width: '100%', textAlign: 'center', display: 'block' }}
          >
            {connectionStatus}
          </span>
        </div>
      </nav>
    </>
  );
};

export default GlobalDashboardHeader;
