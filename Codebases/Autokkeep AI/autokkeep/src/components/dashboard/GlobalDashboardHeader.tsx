'use client';

import React from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import UserMenu from './UserMenu';

let _supabase: ReturnType<typeof createBrowserClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

interface EntityItem {
  id: string;
  name: string;
}

const GlobalDashboardHeader: React.FC = () => {
  const [entities, setEntities] = React.useState<EntityItem[]>([]);
  const [selectedEntity, setSelectedEntity] = React.useState<EntityItem | null>(null);
  const [isEntityDropdownOpen, setIsEntityDropdownOpen] = React.useState(false);
  const [userInitials, setUserInitials] = React.useState('AK');
  const [connectionStatus, setConnectionStatus] = React.useState('Connecting...');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Fetch real entities and user info
  React.useEffect(() => {
    async function loadData() {
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Set user initials from email
          const email = user.email || '';
          const parts = email.split('@')[0].split(/[._-]/);
          const initials = parts.length >= 2
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : email.slice(0, 2).toUpperCase();
          setUserInitials(initials);

          // Get user's org
          const { data: membership } = await (supabase as any)
            .from('team_members')
            .select('org_id')
            .eq('user_id', user.id)
            .single();

          if (membership) {
            // Get entities
            const { data: entityData } = await (supabase as any)
              .from('entities')
              .select('id, name')
              .eq('org_id', membership.org_id)
              .order('created_at', { ascending: true });

            if (entityData && entityData.length > 0) {
              setEntities(entityData);
              setSelectedEntity(entityData[0]);

              // Check bank connection status
              const { data: bankConns } = await (supabase as any)
                .from('bank_connections')
                .select('id, status')
                .eq('entity_id', entityData[0].id)
                .eq('status', 'active');

              setConnectionStatus(
                bankConns && bankConns.length > 0
                  ? 'Live · Plaid Connected'
                  : 'No Bank Connected'
              );
            } else {
              setEntities([]);
              setConnectionStatus('Setup Required');
            }
          }
        } else {
          setConnectionStatus('Not Logged In');
        }
      } catch {
        // Fallback to demo mode
        setEntities([{ id: 'demo', name: 'Demo Entity' }]);
        setSelectedEntity({ id: 'demo', name: 'Demo Entity' });
        setConnectionStatus('Demo Mode');
      }
    }

    loadData();
  }, []);

  const toggleDropdown = React.useCallback(() => {
    setIsEntityDropdownOpen((prev) => !prev);
  }, []);

  const selectEntity = React.useCallback((entity: EntityItem) => {
    setSelectedEntity(entity);
    setIsEntityDropdownOpen(false);
  }, []);

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
        <Link href="/settings" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
          ⚙️ Settings
        </Link>
        <span
          className={`pill ${isLive ? 'pill-live' : ''}`}
          aria-label={`Connection status: ${connectionStatus}`}
        >
          {connectionStatus}
        </span>
        <UserMenu initials={userInitials} />
      </nav>
    </header>
  );
};

export default GlobalDashboardHeader;
