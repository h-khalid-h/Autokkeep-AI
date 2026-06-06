'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Logo from '@/components/ui/Logo';
import { useEntity } from '@/lib/context/EntityContext';
import { createClient } from '@/lib/supabase/client';
import styles from './Sidebar.module.css';

/* ─── Navigation config ─── */
interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Core',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: '⚡' },
      { label: 'Transactions', href: '/transactions', icon: '📋' },
      { label: 'Insights', href: '/insights', icon: '🧠' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Close', href: '/close', icon: '📊' },
      { label: 'Health', href: '/health', icon: '💚' },
      { label: 'Tax', href: '/tax', icon: '🏛️' },
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'Portfolio', href: '/portfolio', icon: '🏢' },
      { label: 'Vendors', href: '/vendors', icon: '🤝' },
      { label: 'Analytics', href: '/analytics', icon: '📈' },
      { label: 'GL Codes', href: '/chart-of-accounts', icon: '📒' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', href: '/settings', icon: '⚙️' },
      { label: 'Account', href: '/account', icon: '👤' },
    ],
  },
];

/* ─── Sidebar component ─── */
export interface SidebarProps {
  pendingCount?: number;
  isConnected?: boolean;
  /** Controlled collapsed state from AppShell */
  collapsed?: boolean;
  /** Callback when collapse is toggled (controlled mode) */
  onToggle?: () => void;
  /** Controlled mobile open state from AppShell */
  mobileOpen?: boolean;
  /** Callback when mobile menu should close */
  onMobileClose?: () => void;
}

export default function Sidebar({ pendingCount, isConnected = false, collapsed: controlledCollapsed, onToggle, mobileOpen: controlledMobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedEntity, entities, setSelectedEntityId } = useEntity();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const mobileOpen = controlledMobileOpen !== undefined ? controlledMobileOpen : internalMobileOpen;
  const setMobileOpen = (open: boolean) => {
    if (onMobileClose && !open) {
      onMobileClose();
    }
    setInternalMobileOpen(open);
  };
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const prevPathnameRef = useRef(pathname);
  const entityDropdownRef = useRef<HTMLDivElement>(null);

  // Close mobile sidebar on route change using ref comparison
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setMobileOpen(false);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close mobile sidebar on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close entity dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(event.target as Node)) {
        setEntityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCollapse = useCallback(() => {
    if (onToggle) {
      // Controlled mode — AppShell manages state directly, no event needed
      onToggle();
    } else {
      // Uncontrolled mode — update internal state and dispatch event for external listeners
      setInternalCollapsed(prev => !prev);
      window.dispatchEvent(new Event('autokkeep-toggle-sidebar'));
    }
  }, [onToggle]);

  const toggleMobile = useCallback(() => {
    setMobileOpen(!mobileOpen);
  }, [mobileOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  // Inject badge count into Dashboard nav item
  const getNavGroups = (): NavGroup[] => {
    return navGroups.map(group => ({
      ...group,
      items: group.items.map(item => ({
        ...item,
        badge: item.href === '/dashboard' ? pendingCount : item.badge,
      })),
    }));
  };

  const entityInitials = selectedEntity?.name
    ? selectedEntity.name.slice(0, 2).toUpperCase()
    : 'AK';

  return (
    <>
      {/* Mobile hamburger trigger — rendered outside sidebar for TopBar to use */}
      <button
        className={styles.mobileToggle}
        onClick={toggleMobile}
        aria-label="Toggle navigation"
        aria-expanded={mobileOpen}
        data-sidebar-toggle
        style={{ display: 'none' }} // Controlled by TopBar via CSS
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Overlay for mobile */}
      <div
        className={`${styles.overlay} ${mobileOpen ? styles.visible : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className={styles.logoArea}>
          <Logo size={28} />
          <span className={styles.logoText}>
            Auto<span className="text-gradient">kkeep</span>
          </span>
        </div>

        {/* Entity Switcher */}
        <div className={styles.entitySwitcher} ref={entityDropdownRef}>
          <button
            className={styles.entityButton}
            onClick={() => setEntityDropdownOpen(!entityDropdownOpen)}
            aria-expanded={entityDropdownOpen}
            aria-haspopup="listbox"
          >
            <span className={styles.entityIcon}>{entityInitials}</span>
            <span className={styles.entityName}>
              {selectedEntity?.name || 'Select Entity'}
            </span>
            <svg className={styles.entityChevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Entity dropdown */}
          {entityDropdownOpen && entities && entities.length > 0 && (
            <div className={styles.entityDropdown} role="listbox" aria-label="Select entity">
              {entities.map((entity) => (
                <button
                  key={entity.id}
                  className={`${styles.entityOption} ${entity.id === selectedEntity?.id ? styles.entityOptionActive : ''}`}
                  onClick={() => {
                    setSelectedEntityId(entity.id);
                    setEntityDropdownOpen(false);
                  }}
                  role="option"
                  aria-selected={entity.id === selectedEntity?.id}
                >
                  <span className={styles.entityIcon}>
                    {entity.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>{entity.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className={styles.nav}>
          {getNavGroups().map((group) => (
            <div key={group.label} className={styles.navGroup}>
              <div className={styles.navGroupLabel}>
                <span className={styles.navGroupLabelText}>{group.label}</span>
              </div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${isActive(item.href) ? styles.active : ''}`}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                >
                  <span className={styles.navItemIcon}>{item.icon}</span>
                  <span className={styles.navItemLabel}>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={styles.navItemBadge}>{item.badge}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={styles.sidebarFooter}>
          {/* Connection status */}
          <div className={styles.connectionStatus}>
            <span className={`${styles.statusDot} ${isConnected ? styles.connected : styles.disconnected}`} />
            <span className={styles.statusLabel}>
              {isConnected ? 'Live · Plaid Connected' : 'No Bank Connected'}
            </span>
          </div>

          {/* Sign out button */}
          <button
            id="sidebar-sign-out"
            className={styles.signOutButton}
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                const supabase = createClient();
                await supabase.auth.signOut();
                router.push('/auth/login');
              } catch (err) {
                console.error('Sign out error:', err);
                setSigningOut(false);
              }
            }}
            aria-label="Sign out"
          >
            <svg className={styles.signOutIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className={styles.signOutLabel}>{signingOut ? 'Signing out…' : 'Sign Out'}</span>
          </button>

          {/* Collapse button */}
          <button
            className={styles.collapseButton}
            onClick={toggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className={styles.collapseIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className={styles.collapseLabel}>Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}

