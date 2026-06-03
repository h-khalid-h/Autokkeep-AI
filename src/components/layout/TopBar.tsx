'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const NotificationBell = dynamic(() => import('@/components/dashboard/NotificationBell'), { ssr: false });
import UserMenu from '@/components/dashboard/UserMenu';
import styles from './TopBar.module.css';

/* ─── Route → title mapping ─── */
const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Transactions',
  '/insights': 'AI Insights',
  '/close': 'Month-End Close',
  '/health': 'Financial Health',
  '/tax': 'Tax Hub',
  '/portfolio': 'Portfolio',
  '/analytics': 'Analytics',
  '/chart-of-accounts': 'Chart of Accounts',
  '/settings': 'Settings',
  '/account': 'Account',
  '/admin': 'Admin',
  '/admin/organizations': 'Organizations',
  '/admin/system': 'System Health',
  '/onboarding': 'Onboarding',
};

/* ─── Breadcrumb builder ─── */
function buildBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];

  let path = '';
  for (const segment of segments) {
    path += `/${segment}`;
    const label = routeTitles[path] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
    crumbs.push({ label, href: path });
  }

  return crumbs;
}

/* ─── TopBar component ─── */
export interface TopBarProps {
  sidebarCollapsed?: boolean;
  onMobileMenuToggle?: () => void;
  onSearchOpen?: () => void;
  actions?: React.ReactNode;
}

export default function TopBar({
  sidebarCollapsed = false,
  onMobileMenuToggle,
  onSearchOpen,
  actions,
}: TopBarProps) {
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => buildBreadcrumbs(pathname), [pathname]);
  const pageTitle = routeTitles[pathname] || breadcrumbs[breadcrumbs.length - 1]?.label || 'Dashboard';

  return (
    <header className={`${styles.topBar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
      {/* Left: mobile menu + breadcrumbs */}
      <div className={styles.leftSection}>
        <button
          className={styles.mobileMenuButton}
          onClick={onMobileMenuToggle}
          aria-label="Toggle navigation menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Breadcrumbs (desktop) */}
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.href} className={styles.breadcrumbSegment}>
              {i > 0 && (
                <span className={styles.breadcrumbSeparator} aria-hidden="true">
                  /
                </span>
              )}
              {i === breadcrumbs.length - 1 ? (
                <span className={`${styles.breadcrumbItem} ${styles.current}`} aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className={styles.breadcrumbItem}>
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </nav>

        {/* Page title (mobile only — shown via CSS) */}
        <h1 className={styles.pageTitle}>{pageTitle}</h1>
      </div>

      {/* Right: search + actions + notifications + user */}
      <div className={styles.rightSection}>
        {/* Search trigger */}
        <button
          className={styles.searchTrigger}
          onClick={onSearchOpen}
          aria-label="Open search"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className={styles.searchLabel}>Search...</span>
          <span className={styles.searchShortcut}>
            <kbd className={styles.kbd}>⌘</kbd>
            <kbd className={styles.kbd}>K</kbd>
          </span>
        </button>

        {/* Page-specific actions */}
        {actions}

        {/* Notification bell */}
        <NotificationBell />

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  );
}
