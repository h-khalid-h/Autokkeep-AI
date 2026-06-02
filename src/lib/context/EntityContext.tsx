'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient as getSupabase } from '@/lib/supabase/client';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

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
  error: string | null;
  refresh: () => void;
}

const EntityContext = createContext<EntityContextValue>({
  entities: [],
  selectedEntity: null,
  setSelectedEntityId: () => {},
  isLoading: true,
  error: null,
  refresh: () => {},
});

// ─── Storage Key ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'autokkeep_selected_entity_id';

// ─── Provider ───────────────────────────────────────────────────────────────────

export function EntityProvider({ children }: { children: React.ReactNode }) {
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<EntityItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntities = useCallback(async () => {
    try {
      setError(null);
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const db = supabase as unknown as SupabaseQueryClient;
      const { data: membershipData, error: membershipError } = await db
        .from('team_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1);

      if (membershipError) {
        setError('Failed to load team membership. Please try again.');
        setIsLoading(false);
        return;
      }

      const membership = membershipData?.[0] ?? null;

      if (!membership) {
        // No org membership — redirect to onboarding (defense-in-depth)
        if (typeof window !== 'undefined' && window.location.pathname !== '/onboarding') {
          window.location.replace('/onboarding');
        }
        setIsLoading(false);
        return;
      }

      const { data: entityData, error: entityError } = await db
        .from('entities')
        .select('id, name, base_currency')
        .eq('org_id', membership.org_id)
        .order('created_at', { ascending: true });

      if (entityError) {
        setError('Failed to load entities. Please try again.');
        setIsLoading(false);
        return;
      }

      const items: EntityItem[] = (entityData || []).map(
        (e: { id: string; name: string; base_currency?: string }) => ({
          id: e.id,
          name: e.name,
          currency: e.base_currency || 'USD',
        })
      );
      setEntities(items);

      // Restore previous selection from localStorage
      const savedId = typeof window !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY)
        : null;
      const saved = savedId ? items.find((e) => e.id === savedId) : null;
      setSelectedEntity(saved || items[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entities');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEntities();
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
        error,
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
