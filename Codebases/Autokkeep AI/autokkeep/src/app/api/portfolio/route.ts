// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/portfolio — Multi-Entity Portfolio Overview
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Returns per-entity stats for the CPA firm's portfolio dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

interface EntityStats {
  entityId: string;
  entityName: string;
  currency: string;
  /** Number of transactions needing human review */
  pendingExceptions: number;
  /** Total transactions this period */
  totalTransactions: number;
  /** Auto-booked rate: (approved + synced) / total */
  abr: number;
  /** Last bank sync time (ISO string or null) */
  lastSync: string | null;
  /** Close readiness: % of transactions resolved */
  closeReadiness: number;
  /** Bank connection status */
  bankStatus: 'connected' | 'disconnected' | 'error';
  /** Ledger connection status */
  ledgerStatus: 'connected' | 'disconnected';
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's org
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 });
    }

    // Get all entities for this org
    const { data: entities, error: entityError } = await (supabase as any)
      .from('entities')
      .select('id, name, base_currency')
      .eq('org_id', membership.org_id)
      .order('name', { ascending: true });

    if (entityError || !entities || entities.length === 0) {
      return NextResponse.json({ entities: [], summary: getEmptySummary() });
    }

    const entityIds = entities.map((e: any) => e.id);

    // Batch fetch all transaction counts per entity + status
    const { data: allTransactions } = await (supabase as any)
      .from('transactions')
      .select('entity_id, status, confidence')
      .in('entity_id', entityIds)
      .is('deleted_at', null);

    // Batch fetch bank connection statuses
    const { data: bankConnections } = await (supabase as any)
      .from('bank_connections')
      .select('entity_id, status, last_synced_at')
      .in('entity_id', entityIds);

    // Batch fetch ledger connection statuses
    const { data: ledgerConnections } = await (supabase as any)
      .from('ledger_connections')
      .select('entity_id, is_active')
      .in('entity_id', entityIds);

    // Build per-entity stats
    const txByEntity = new Map<string, any[]>();
    for (const tx of allTransactions || []) {
      const list = txByEntity.get(tx.entity_id) || [];
      list.push(tx);
      txByEntity.set(tx.entity_id, list);
    }

    const bankByEntity = new Map<string, any>();
    for (const bc of bankConnections || []) {
      // Keep the most recently synced connection
      const existing = bankByEntity.get(bc.entity_id);
      if (!existing || (bc.last_synced_at && (!existing.last_synced_at || bc.last_synced_at > existing.last_synced_at))) {
        bankByEntity.set(bc.entity_id, bc);
      }
    }

    const ledgerByEntity = new Map<string, boolean>();
    for (const lc of ledgerConnections || []) {
      if (lc.is_active) {
        ledgerByEntity.set(lc.entity_id, true);
      }
    }

    const entityStats: EntityStats[] = entities.map((entity: any) => {
      const txs = txByEntity.get(entity.id) || [];
      const total = txs.length;
      const pending = txs.filter((t: any) => t.status === 'human_review' || t.status === 'pending').length;
      const resolved = txs.filter((t: any) =>
        t.status === 'approved' || t.status === 'synced' || t.status === 'auto_categorized'
      ).length;

      const abr = total > 0 ? Math.round((resolved / total) * 100) : 0;
      const closeReadiness = total > 0 ? Math.round(((total - pending) / total) * 100) : 100;

      const bank = bankByEntity.get(entity.id);
      const bankStatus: EntityStats['bankStatus'] = bank
        ? bank.status === 'active' ? 'connected' : 'error'
        : 'disconnected';

      const ledgerStatus: EntityStats['ledgerStatus'] = ledgerByEntity.get(entity.id)
        ? 'connected'
        : 'disconnected';

      return {
        entityId: entity.id,
        entityName: entity.name,
        currency: entity.base_currency || 'USD',
        pendingExceptions: pending,
        totalTransactions: total,
        abr,
        lastSync: bank?.last_synced_at || null,
        closeReadiness,
        bankStatus,
        ledgerStatus,
      };
    });

    // Portfolio summary
    const summary = {
      totalEntities: entityStats.length,
      totalPending: entityStats.reduce((sum, e) => sum + e.pendingExceptions, 0),
      totalTransactions: entityStats.reduce((sum, e) => sum + e.totalTransactions, 0),
      avgAbr: entityStats.length > 0
        ? Math.round(entityStats.reduce((sum, e) => sum + e.abr, 0) / entityStats.length)
        : 0,
      avgCloseReadiness: entityStats.length > 0
        ? Math.round(entityStats.reduce((sum, e) => sum + e.closeReadiness, 0) / entityStats.length)
        : 0,
      connectedBanks: entityStats.filter(e => e.bankStatus === 'connected').length,
      connectedLedgers: entityStats.filter(e => e.ledgerStatus === 'connected').length,
    };

    return NextResponse.json({ entities: entityStats, summary });
  } catch (error) {
    console.error('[Portfolio] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load portfolio data' },
      { status: 500 }
    );
  }
}

function getEmptySummary() {
  return {
    totalEntities: 0,
    totalPending: 0,
    totalTransactions: 0,
    avgAbr: 0,
    avgCloseReadiness: 0,
    connectedBanks: 0,
    connectedLedgers: 0,
  };
}
