'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

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

interface RealtimeEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  transaction: any;
  timestamp: string;
}

export function useRealtimeTransactions(
  entityIds: string[],
  onEvent: (event: RealtimeEvent) => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!entityIds.length) return;

    try {
      const supabase = getSupabase();
      const channel = supabase
        .channel('transactions-realtime')
        .on(
          'postgres_changes' as any,
          {
            event: '*',
            schema: 'public',
            table: 'transactions',
            filter: `entity_id=in.(${entityIds.join(',')})`,
          },
          (payload: any) => {
            onEvent({
              type: payload.eventType,
              transaction: payload.new || payload.old,
              timestamp: new Date().toISOString(),
            });
          }
        )
        .subscribe((status: string) => {
          setIsConnected(status === 'SUBSCRIBED');
        });

      channelRef.current = channel;

      return () => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }
      };
    } catch {
      // Realtime not available (e.g., no Supabase configured)
      setIsConnected(false);
    }
  }, [entityIds.join(','), onEvent]);

  return { isConnected };
}
