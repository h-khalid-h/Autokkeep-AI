'use client';

import React from 'react';
import Link from 'next/link';

const entities = ['Acme Corp', 'TechStart Inc', 'Green Valley LLC'];

const GlobalDashboardHeader: React.FC = () => {
  const [selectedEntity, setSelectedEntity] = React.useState(entities[0]);
  const [isEntityDropdownOpen, setIsEntityDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const toggleDropdown = React.useCallback(() => {
    setIsEntityDropdownOpen((prev) => !prev);
  }, []);

  const selectEntity = React.useCallback((entity: string) => {
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
          aria-label={`Selected entity: ${selectedEntity}`}
        >
          <span aria-hidden="true">🏢</span>
          {selectedEntity}
          <span aria-hidden="true">{isEntityDropdownOpen ? '▲' : '▼'}</span>
        </button>
        {isEntityDropdownOpen && (
          <ul
            className="category-search-dropdown"
            role="listbox"
            aria-label="Entity selection"
          >
            {entities.map((entity) => (
              <li
                key={entity}
                className="category-option"
                role="option"
                aria-selected={entity === selectedEntity}
                onClick={() => selectEntity(entity)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') selectEntity(entity);
                }}
                tabIndex={0}
              >
                <span className="category-option-code" aria-hidden="true">
                  🏢
                </span>
                {entity}
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
        <span className="pill pill-live" aria-label="Connection status: Live, Plaid Connected">
          Live · Plaid Connected
        </span>
        <div
          className="slack-avatar"
          role="img"
          aria-label="User avatar"
        >
          JC
        </div>
      </nav>
    </header>
  );
};

export default GlobalDashboardHeader;
