import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { checkPlanLimits } from '@/lib/billing/plans';
import {
  syncJournalEntry,
  syncChartOfAccounts,
  upsertChartOfAccounts,
  buildJournalEntryFromTransaction,
  refreshXeroToken,
} from '@/lib/ledger/sync';
import { writeAuditLog } from '@/lib/audit';
import { encryptToken, decryptToken } from '@/lib/crypto';
import { getGLCode } from '@/lib/entity-settings';
import { parseBody, schemas } from '@/lib/validation';

// POST /api/ledger/xero/sync — Sync approved transactions to Xero
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'xero-sync' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const bodyResult = await parseBody(request, schemas.ledgerSync);
    if (!bodyResult.success) return bodyResult.error;
    const { entityId, transactionIds } = bodyResult.data;

    // Verify entity belongs to user's org
    const { data: entity } = await db.from('entities').select('org_id').eq('id', entityId).single();
    if (!entity || entity.org_id !== membership.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Enforce plan limits
    const planCheck = await checkPlanLimits(db, membership.org_id, 'sync_ledger');
    if (!planCheck.allowed) {
      return NextResponse.json({ error: planCheck.reason, plan: planCheck.currentPlan }, { status: 403 });
    }


    const { data: conn } = await db
      .from('ledger_connections')
      .select('*')
      .eq('entity_id', entityId)
      .eq('provider', 'xero')
      .eq('is_active', true)
      .single();

    if (!conn) {
      return NextResponse.json(
        { error: 'No active Xero connection for this entity' },
        { status: 404 }
      );
    }

    // Decrypt tokens from DB
    conn.access_token = decryptToken(conn.access_token);
    conn.refresh_token = decryptToken(conn.refresh_token);

    let query = db
      .from('transactions')
      .select('*')
      .eq('entity_id', entityId)
      .eq('status', 'approved');

    if (transactionIds?.length) {
      query = query.in('id', transactionIds);
    }

    const { data: transactions } = await query;

    if (!transactions?.length) {
      return NextResponse.json({ ok: true, synced: 0, message: 'No transactions to sync' });
    }

    // Optimistic lock: claim transactions by setting status to 'syncing'
    const txIds = transactions.map((t: Record<string, unknown>) => t.id);
    const { data: claimed, error: claimError } = await db
      .from('transactions')
      .update({ status: 'syncing', updated_at: new Date().toISOString() })
      .in('id', txIds)
      .eq('status', 'approved')
      .select('*');

    if (claimError || !claimed?.length) {
      return NextResponse.json({ ok: true, synced: 0, message: 'Transactions already being synced by another process' });
    }

    const bankAccountGLCode = await getGLCode(db, entityId, 'cash_gl');
    const defaultExpenseGL = await getGLCode(db, entityId, 'default_expense_gl');
    const results = { synced: 0, failed: 0, errors: [] as string[] };

    // Refresh token before making API calls (Xero tokens expire after 30 minutes)
    let accessToken = conn.access_token;
    const tokenExpired = conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now();

    if (conn.refresh_token) {
      try {
        const refreshed = await refreshXeroToken(conn.refresh_token);
        accessToken = refreshed.accessToken;
        await db
          .from('ledger_connections')
          .update({
            access_token: encryptToken(refreshed.accessToken),
            refresh_token: encryptToken(refreshed.refreshToken),
            token_expires_at: new Date(Date.now() + (refreshed.expiresIn || 1800) * 1000).toISOString(),
          })
          .eq('id', conn.id);
      } catch (refreshError) {
        console.error('[Xero Sync] Token refresh failed:', refreshError);
        if (tokenExpired) {
          await db.from('ledger_connections').update({ is_active: false }).eq('id', conn.id);
          return NextResponse.json(
            { error: 'Xero token expired. Please re-authenticate.' },
            { status: 401 }
          );
        }
        console.warn('[Xero Sync] Using existing token (may still be valid)');
      }
    } else if (tokenExpired) {
      return NextResponse.json(
        { error: 'Xero token expired and no refresh token available' },
        { status: 401 }
      );
    }

    for (const tx of claimed) {
      try {
        const entry = buildJournalEntryFromTransaction(tx, bankAccountGLCode, defaultExpenseGL);

        const syncResult = await syncJournalEntry(
          'xero',
          { accessToken, tenantId: conn.tenant_id },
          entry
        );

        if (syncResult.success) {
          const { data: je } = await db
            .from('journal_entries')
            .insert({
              entity_id: entityId,
              transaction_id: tx.id,
              entry_date: tx.date,
              memo: `Auto-posted: ${tx.merchant_name}`,
              status: 'posted',
              posted_at: new Date().toISOString(),
              created_by: 'system',
              ledger_sync_id: syncResult.journalEntryId,
              ledger_type: 'xero',
            })
            .select('id')
            .single();

          // Create journal lines from the entry (handles expense vs income signs)
          if (je) {
            await db.from('journal_lines').insert(
              entry.lines.map((line) => ({
                journal_entry_id: je.id,
                gl_code: line.glCode,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
              }))
            );
          }

          await db
            .from('transactions')
            .update({ status: 'synced', updated_at: new Date().toISOString() })
            .eq('id', tx.id);

          results.synced++;

          await writeAuditLog({
            supabase: db,
            entityId,
            actorId: user.id,
            actorType: 'system',
            action: 'sync',
            targetType: 'transaction',
            targetId: tx.id,
            details: { ledger: 'xero', journal_entry_id: syncResult.journalEntryId },
            request,
          });
        } else {
          results.failed++;
          results.errors.push(`${tx.id}: ${syncResult.error}`);
        }
      } catch (_error: unknown) {
        results.failed++;
        results.errors.push(`${tx.id}: sync error`);
      }
    }

    // Reset any failed transactions back to 'approved' for retry
    if (results.failed > 0) {
      const { data: stillSyncing } = await db
        .from('transactions')
        .select('id')
        .in('id', txIds)
        .eq('status', 'syncing');
      if (stillSyncing?.length) {
        await db
          .from('transactions')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .in('id', stillSyncing.map((t: Record<string, unknown>) => t.id));
      }
    }

    await db
      .from('ledger_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', conn.id);

    // Audit log the sync
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'sync',
      targetType: 'xero',
      details: { ...results },
      request,
    });

    return NextResponse.json({ ok: true, ...results });
  } catch (_error: unknown) {
    return NextResponse.json(
      { error: 'Xero sync failed' },
      { status: 500 }
    );
  }
}

// GET /api/ledger/xero/sync — Sync Chart of Accounts from Xero
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'xero-coa-sync' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    // Now validate input
    const entityId = request.nextUrl.searchParams.get('entityId');
    if (!entityId) {
      return NextResponse.json({ error: 'Missing entityId' }, { status: 400 });
    }

    // Verify entity belongs to user's org
    const { data: entity } = await db.from('entities').select('org_id').eq('id', entityId).single();
    if (!entity || entity.org_id !== membership.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: conn } = await db
      .from('ledger_connections')
      .select('*')
      .eq('entity_id', entityId)
      .eq('provider', 'xero')
      .eq('is_active', true)
      .single();

    if (!conn) {
      return NextResponse.json({ error: 'No Xero connection' }, { status: 404 });
    }

    // Decrypt tokens from DB
    conn.access_token = decryptToken(conn.access_token);
    conn.refresh_token = decryptToken(conn.refresh_token);

    // Refresh token if expired (Xero tokens last 30 minutes)
    let accessToken = conn.access_token;
    const tokenExpired = conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now();

    if (conn.refresh_token && tokenExpired) {
      try {
        const refreshed = await refreshXeroToken(conn.refresh_token);
        accessToken = refreshed.accessToken;
        await db
          .from('ledger_connections')
          .update({
            access_token: encryptToken(refreshed.accessToken),
            refresh_token: encryptToken(refreshed.refreshToken),
            token_expires_at: new Date(Date.now() + (refreshed.expiresIn || 1800) * 1000).toISOString(),
          })
          .eq('id', conn.id);
      } catch {
        return NextResponse.json({ error: 'Xero token expired. Please re-authenticate.' }, { status: 401 });
      }
    } else if (tokenExpired) {
      return NextResponse.json({ error: 'Xero token expired and no refresh token available' }, { status: 401 });
    }

    const accounts = await syncChartOfAccounts('xero', {
      accessToken,
      tenantId: conn.tenant_id,
    });

    // Batch upsert chart of accounts (replaces one-by-one loop)
    const upsertResult = await upsertChartOfAccounts(db, entityId, accounts);

    return NextResponse.json({
      ok: true,
      accounts: accounts.length,
      upserted: upsertResult.upserted,
      errors: upsertResult.errors,
    });
  } catch (_error: unknown) {
    return NextResponse.json(
      { error: 'Xero chart of accounts sync failed' },
      { status: 500 }
    );
  }
}
