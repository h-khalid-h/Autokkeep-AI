import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { checkPlanLimits } from '@/lib/billing/plans';
import {
  syncJournalEntry,
  syncChartOfAccounts,
  buildJournalEntryFromTransaction,
  refreshQBOToken,
} from '@/lib/ledger/sync';
import { writeAuditLog } from '@/lib/audit';
import { encryptToken, decryptToken } from '@/lib/crypto';

// POST /api/ledger/quickbooks/sync — Sync approved transactions to QuickBooks
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'qbo-sync' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const { entityId, transactionIds } = await request.json();

    if (!entityId) {
      return NextResponse.json({ error: 'Missing entityId' }, { status: 400 });
    }

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

    // Get QBO connection
    const { data: conn } = await db
      .from('ledger_connections')
      .select('*')
      .eq('entity_id', entityId)
      .eq('provider', 'quickbooks')
      .eq('is_active', true)
      .single();

    if (!conn) {
      return NextResponse.json(
        { error: 'No active QuickBooks connection for this entity' },
        { status: 404 }
      );
    }

    // Decrypt tokens from DB
    conn.access_token = decryptToken(conn.access_token);
    conn.refresh_token = decryptToken(conn.refresh_token);

    // Get approved transactions that haven't been synced
    let query = db
      .from('transactions')
      .select('*')
      .eq('entity_id', entityId)
      .eq('status', 'approved');

    if (transactionIds?.length) {
      query = query.in('id', transactionIds);
    }

    const { data: transactions, error: txError } = await query;

    if (txError || !transactions?.length) {
      return NextResponse.json({
        ok: true,
        synced: 0,
        message: 'No approved transactions to sync',
      });
    }

    // Optimistic lock: claim transactions by setting status to 'syncing'
    // This prevents double-sync if two requests arrive concurrently
    const txIds = transactions.map((t: Record<string, unknown>) => t.id);
    const { data: claimed, error: claimError } = await db
      .from('transactions')
      .update({ status: 'syncing', updated_at: new Date().toISOString() })
      .in('id', txIds)
      .eq('status', 'approved') // Only claim if still approved (another request may have claimed them)
      .select('*');

    if (claimError || !claimed?.length) {
      return NextResponse.json({
        ok: true,
        synced: 0,
        message: 'Transactions already being synced by another process',
      });
    }

    // Get the bank account GL code (default: 1010 - Checking)
    const bankAccountGLCode = '1010';

    const results = {
      synced: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Refresh token before making API calls (QBO tokens expire after 1 hour)
    let accessToken = conn.access_token;
    const tokenExpired = conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now();

    if (conn.refresh_token) {
      try {
        const refreshed = await refreshQBOToken(conn.refresh_token);
        accessToken = refreshed.accessToken;
        // Persist refreshed tokens
        await db
          .from('ledger_connections')
          .update({
            access_token: encryptToken(refreshed.accessToken),
            refresh_token: encryptToken(refreshed.refreshToken),
            token_expires_at: new Date(Date.now() + (refreshed.expiresIn || 3600) * 1000).toISOString(),
          })
          .eq('id', conn.id);
      } catch (refreshError) {
        console.error('[QBO Sync] Token refresh failed:', refreshError);
        if (tokenExpired) {
          // Token is expired and refresh failed — abort rather than making doomed API calls
          await db.from('ledger_connections').update({ is_active: false }).eq('id', conn.id);
          return NextResponse.json(
            { error: 'QuickBooks token expired. Please re-authenticate.' },
            { status: 401 }
          );
        }
        // Token may still be valid — try with existing token
        console.warn('[QBO Sync] Using existing token (may still be valid)');
      }
    } else if (tokenExpired) {
      return NextResponse.json(
        { error: 'QuickBooks token expired and no refresh token available' },
        { status: 401 }
      );
    }

    for (const tx of claimed) {
      try {
        const entry = buildJournalEntryFromTransaction(tx, bankAccountGLCode);

        const syncResult = await syncJournalEntry(
          'quickbooks',
          {
            accessToken,
            realmId: conn.realm_id,
          },
          entry
        );

        if (syncResult.success) {
          // Create journal entry record
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
              ledger_type: 'quickbooks',
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

          // Update transaction status
          await db
            .from('transactions')
            .update({ status: 'synced', updated_at: new Date().toISOString() })
            .eq('id', tx.id);

          results.synced++;

          // Audit log
          await writeAuditLog({
            supabase: db,
            entityId,
            actorId: user.id,
            actorType: 'system',
            action: 'sync',
            targetType: 'transaction',
            targetId: tx.id,
            details: {
              ledger: 'quickbooks',
              journal_entry_id: syncResult.journalEntryId,
              doc_number: syncResult.docNumber,
            },
            request,
          });
        } else {
          results.failed++;
          results.errors.push(`${tx.id}: ${syncResult.error}`);
        }
      } catch (_error: unknown) {
        results.failed++;
        results.errors.push(
          `${tx.id}: sync error`
        );
      }
    }

    // Reset any failed transactions back to 'approved' so they can be retried
    if (results.failed > 0) {
      // Get IDs of txns that are still 'syncing' (weren't set to 'synced')
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

    // Update last synced timestamp
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
      targetType: 'quickbooks',
      details: { ...results },
      request,
    });

    return NextResponse.json({
      ok: true,
      ...results,
    });
  } catch (_error: unknown) {
    return NextResponse.json(
      { error: 'QuickBooks sync failed' },
      { status: 500 }
    );
  }
}

// GET /api/ledger/quickbooks/sync — Sync Chart of Accounts from QBO
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'qbo-coa-sync' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

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
      .eq('provider', 'quickbooks')
      .eq('is_active', true)
      .single();

    if (!conn) {
      return NextResponse.json({ error: 'No QBO connection' }, { status: 404 });
    }

    // Decrypt tokens from DB
    conn.access_token = decryptToken(conn.access_token);
    conn.refresh_token = decryptToken(conn.refresh_token);

    // Refresh token if expired (QBO tokens last 1 hour)
    let accessToken = conn.access_token;
    const tokenExpired = conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now();

    if (conn.refresh_token && tokenExpired) {
      try {
        const refreshed = await refreshQBOToken(conn.refresh_token);
        accessToken = refreshed.accessToken;
        await db
          .from('ledger_connections')
          .update({
            access_token: encryptToken(refreshed.accessToken),
            refresh_token: encryptToken(refreshed.refreshToken),
            token_expires_at: new Date(Date.now() + (refreshed.expiresIn || 3600) * 1000).toISOString(),
          })
          .eq('id', conn.id);
      } catch {
        return NextResponse.json({ error: 'QuickBooks token expired. Please re-authenticate.' }, { status: 401 });
      }
    } else if (tokenExpired) {
      return NextResponse.json({ error: 'QuickBooks token expired and no refresh token available' }, { status: 401 });
    }

    const accounts = await syncChartOfAccounts('quickbooks', {
      accessToken,
      realmId: conn.realm_id,
    });

    // Upsert chart of accounts
    for (const acc of accounts) {
      await db.from('chart_of_accounts').upsert(
        {
          entity_id: entityId,
          code: acc.code,
          name: acc.name,
          type: acc.type as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
          is_active: true,
        },
        { onConflict: 'entity_id,code' }
      );
    }

    return NextResponse.json({
      ok: true,
      accounts: accounts.length,
    });
  } catch (_error: unknown) {
    return NextResponse.json(
      { error: 'QuickBooks chart of accounts sync failed' },
      { status: 500 }
    );
  }
}
