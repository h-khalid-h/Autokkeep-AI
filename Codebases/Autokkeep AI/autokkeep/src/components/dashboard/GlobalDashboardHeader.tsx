'use client';

import React from 'react';
import Link from 'next/link';
import { createClient as getSupabase } from '@/lib/supabase/client';
import { useEntity } from '@/lib/context/EntityContext';
import UserMenu from './UserMenu';
import NotificationBell from './NotificationBell';

const GlobalDashboardHeader: React.FC = () => {
  const { entities, selectedEntity, setSelectedEntityId } = useEntity();
  const [isEntityDropdownOpen, setIsEntityDropdownOpen] = React.useState(false);
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
        const { data: bankConns } = await (supabase as any)
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

  const displayName = selectedEntity?.name || 'No Entity';
  const isLive = connectionStatus.includes('Live');

  return (
    <header className="dashboard-header" role="banner">
      {/* Logo */}
      <div className="navbar-logo">
        <div className="navbar-logo-icon" aria-hidden="true">
          AK
        </div>
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
        <Link href="/analytics" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
          📊 Analytics
        </Link>
        <Link href="/transactions" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
          📋 History
        </Link>
        <Link href="/chart-of-accounts" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
          📒 GL Codes
        </Link>
        <Link href="/settings" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
          ⚙️ Settings
        </Link>
        <span
          className={`pill ${isLive ? 'pill-live' : ''}`}
          aria-label={`Connection status: ${connectionStatus}`}
        >
          {connectionStatus}
        </span>
        <NotificationBell />
        <UserMenu initials={userInitials} />
      </nav>
    </header>
  );
};

export default GlobalDashboardHeader;
