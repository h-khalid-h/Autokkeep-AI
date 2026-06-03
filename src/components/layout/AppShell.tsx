'use client';

import { useState, useCallback, useEffect } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useNavigationShortcuts } from '@/hooks/useKeyboardShortcuts';
import { KeyboardShortcutsHelp } from '@/components/ui/KeyboardShortcutsHelp';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: React.ReactNode;
  /** Pending transaction count for sidebar badge */
  pendingCount?: number;
  /** Bank connection status */
  isConnected?: boolean;
  /** Whether content should be full width */
  fullWidth?: boolean;
  /** Page-specific actions for the top bar */
  topBarActions?: React.ReactNode;
}

export default function AppShell({
  children,
  pendingCount,
  isConnected = false,
  fullWidth = false,
  topBarActions,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global keyboard shortcuts
  useNavigationShortcuts();

  const handleSidebarToggle = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  // Listen for sidebar toggle events from keyboard shortcut
  useEffect(() => {
    window.addEventListener('autokkeep-toggle-sidebar', handleSidebarToggle);
    return () => window.removeEventListener('autokkeep-toggle-sidebar', handleSidebarToggle);
  }, [handleSidebarToggle]);

  const handleMobileMenuToggle = useCallback(() => {
    setMobileMenuOpen(prev => !prev);
  }, []);

  const handleSearchOpen = useCallback(() => {
    // TODO: Wire up CommandPalette component when implemented
    // For now, show a 'coming soon' toast so users know the feature isn't ready
    console.info('[AppShell] Search triggered but CommandPalette is not yet implemented');
  }, []);

  return (
    <div className={styles.appShell}>
      <Sidebar
        pendingCount={pendingCount}
        isConnected={isConnected}
        collapsed={sidebarCollapsed}
        onToggle={handleSidebarToggle}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <TopBar
        sidebarCollapsed={sidebarCollapsed}
        onMobileMenuToggle={handleMobileMenuToggle}
        onSearchOpen={handleSearchOpen}
        actions={topBarActions}
      />

      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={`${styles.contentArea} ${fullWidth ? styles.fullWidth : ''}`}>
          {children}
        </div>
      </div>

      <KeyboardShortcutsHelp />
    </div>
  );
}
