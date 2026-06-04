// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/portfolio — Multi-Entity Portfolio Overview
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Returns per-entity stats for the organization's portfolio dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';

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
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'portfolio' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    // Get all entities for this org
    const { data: entities, error: entityError } = await db
      .from('entities')
      .select('id, name, base_currency')
      .eq('org_id', membership.org_id)
      .order('name', { ascending: true });

    if (entityError || !entities || entities.length === 0) {
      return NextResponse.json({ entities: [], summary: getEmptySummary() });
    }

    const entityIds = entities.map((e: { id: string }) => e.id);

    // Batch fetch transaction counts per entity using efficient COUNT queries
    // instead of fetching all rows (removes 10K cap)
    const countQueries = entityIds.flatMap((eid: string) => [
      db.from('transactions').select('id', { count: 'exact', head: true })
        .eq('entity_id', eid).is('deleted_at', null)
        .then((r: { count: number | null }) => ({ entityId: eid, type: 'total', count: r.count ?? 0 })),
      db.from('transactions').select('id', { count: 'exact', head: true })
        .eq('entity_id', eid).in('status', ['human_review', 'pending']).is('deleted_at', null)
        .then((r: { count: number | null }) => ({ entityId: eid, type: 'pending', count: r.count ?? 0 })),
      db.from('transactions').select('id', { count: 'exact', head: true })
        .eq('entity_id', eid).in('status', ['approved', 'synced', 'auto_categorized']).is('deleted_at', null)
        .then((r: { count: number | null }) => ({ entityId: eid, type: 'resolved', count: r.count ?? 0 })),
    ]);

    const countResults = await Promise.all(countQueries);

    // Build per-entity count maps
    const txByEntity = new Map<string, { total: number; pending: number; resolved: number }>();
    for (const r of countResults) {
      const existing = txByEntity.get(r.entityId) || { total: 0, pending: 0, resolved: 0 };
      existing[r.type as 'total' | 'pending' | 'resolved'] = r.count;
      txByEntity.set(r.entityId, existing);
    }

    // Batch fetch bank connection statuses
    const { data: bankConnections } = await db
      .from('bank_connections')
      .select('entity_id, status, last_synced_at')
      .in('entity_id', entityIds);

    // Batch fetch ledger connection statuses
    const { data: ledgerConnections } = await db
      .from('ledger_connections')
      .select('entity_id, is_active')
      .in('entity_id', entityIds);

    const bankByEntity = new Map<string, { entity_id: string; status: string; last_synced_at: string | null }>();
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

    const entityStats: EntityStats[] = entities.map((entity: { id: string; name: string; base_currency: string }) => {
      const counts = txByEntity.get(entity.id) || { total: 0, pending: 0, resolved: 0 };
      const { total, pending, resolved } = counts;

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
