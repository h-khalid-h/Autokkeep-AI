'use client';

import { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: React.ReactNode;
  /** Pending transaction count for sidebar badge */
  pendingCount?: number;
  /** Bank connection status */
  isConnected?: boolean;
  /** Unread notification count */
  unreadCount?: number;
  /** User initials for avatar */
  userInitials?: string;
  /** User email */
  userEmail?: string;
  /** Whether content should be full width */
  fullWidth?: boolean;
  /** Page-specific actions for the top bar */
  topBarActions?: React.ReactNode;
}

export default function AppShell({
  children,
  pendingCount,
  isConnected = false,
  unreadCount = 0,
  userInitials = 'U',
  userEmail,
  fullWidth = false,
  topBarActions,
}: AppShellProps) {
  const [sidebarCollapsed, _setSidebarCollapsed] = useState(false);
  const [_mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleMobileMenuToggle = useCallback(() => {
    setMobileMenuOpen(prev => !prev);
  }, []);

  const handleSearchOpen = useCallback(() => {
    // Dispatch custom event for CommandPalette to listen to
    window.dispatchEvent(new CustomEvent('autokkeep-command-palette', { detail: { open: true } }));
  }, []);

  return (
    <div className={styles.appShell}>
      <Sidebar
        pendingCount={pendingCount}
        isConnected={isConnected}
      />

      <TopBar
        sidebarCollapsed={sidebarCollapsed}
        onMobileMenuToggle={handleMobileMenuToggle}
        onSearchOpen={handleSearchOpen}
        unreadCount={unreadCount}
        userInitials={userInitials}
        userEmail={userEmail}
        actions={topBarActions}
      />

      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={`${styles.contentArea} ${fullWidth ? styles.fullWidth : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
