'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient as getSupabase } from '@/lib/supabase/client';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface EntityItem {
  id: string;
  name: string;
  currency?: string;
}

interface EntityContextValue {
  entities: EntityItem[];
  selectedEntity: EntityItem | null;
  setSelectedEntityId: (id: string) => void;
  isLoading: boolean;
  refresh: () => void;
}

const EntityContext = createContext<EntityContextValue>({
  entities: [],
  selectedEntity: null,
  setSelectedEntityId: () => {},
  isLoading: true,
  refresh: () => {},
});

// ─── Storage Key ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'autokkeep_selected_entity_id';

// ─── Provider ───────────────────────────────────────────────────────────────────

export function EntityProvider({ children }: { children: React.ReactNode }) {
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<EntityItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadEntities = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: membership } = await (supabase as any)
        .from('team_members')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) {
        setIsLoading(false);
        return;
      }

      const { data: entityData } = await (supabase as any)
        .from('entities')
        .select('id, name, currency')
        .eq('org_id', membership.org_id)
        .order('created_at', { ascending: true });

      const items: EntityItem[] = entityData || [];
      setEntities(items);

      // Restore previous selection from localStorage
      const savedId = typeof window !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY)
        : null;
      const saved = savedId ? items.find((e) => e.id === savedId) : null;
      setSelectedEntity(saved || items[0] || null);
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  const setSelectedEntityId = useCallback(
    (id: string) => {
      const entity = entities.find((e) => e.id === id);
      if (entity) {
        setSelectedEntity(entity);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, id);
        }
      }
    },
    [entities]
  );

  return (
    <EntityContext.Provider
      value={{
        entities,
        selectedEntity,
        setSelectedEntityId,
        isLoading,
        refresh: loadEntities,
      }}
    >
      {children}
    </EntityContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

export function useEntity() {
  return useContext(EntityContext);
}
