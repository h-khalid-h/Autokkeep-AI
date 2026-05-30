'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';

// ─── Component ──────────────────────────────────────────────────────────────

const EntitySelector: React.FC = () => {
  const { entities, selectedEntity, setSelectedEntityId } = useEntity();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const toggleDropdown = React.useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const selectEntity = React.useCallback(
    (entity: { id: string; name: string }) => {
      setSelectedEntityId(entity.id);
      setIsOpen(false);
    },
    [setSelectedEntityId]
  );

  // Close dropdown on outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = selectedEntity?.name || 'No Entity';

  return (
    <div ref={dropdownRef} className="category-search">
      <button
        className="btn btn-secondary"
        onClick={toggleDropdown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Selected entity: ${displayName}`}
        disabled={entities.length === 0}
      >
        <span aria-hidden="true">🏢</span>
        {displayName}
        {entities.length > 1 && (
          <span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
        )}
      </button>
      {isOpen && entities.length > 1 && (
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
  );
};

export default EntitySelector;
