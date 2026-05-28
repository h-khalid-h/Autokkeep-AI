import { NextRequest, NextResponse } from 'next/server';
import { checkPlanLimits } from '@/lib/billing/plans';
import {
  syncJournalEntry,
  syncChartOfAccounts,
  buildJournalEntryFromTransaction,
  refreshXeroToken,
} from '@/lib/ledger/sync';

// POST /api/ledger/xero/sync — Sync approved transactions to Xero
export async function POST(request: NextRequest) {
  try {
    const { entityId, transactionIds } = await request.json();

    if (!entityId) {
      return NextResponse.json({ error: 'Missing entityId' }, { status: 400 });
    }

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Org membership check
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    if (!membership) {
      return NextResponse.json({ error: 'No organization membership' }, { status: 403 });
    }

    // Verify entity belongs to user's org
    const { data: entity } = await (supabase as any).from('entities').select('org_id').eq('id', entityId).single();
    if (!entity || entity.org_id !== membership.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Enforce plan limits
    const planCheck = await checkPlanLimits(supabase as any, membership.org_id, 'sync_ledger');
    if (!planCheck.allowed) {
      return NextResponse.json({ error: planCheck.reason, plan: planCheck.currentPlan }, { status: 403 });
    }


    const { data: conn } = await (supabase as any)
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

    let query = (supabase as any)
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
    const txIds = transactions.map((t: any) => t.id);
    const { data: claimed, error: claimError } = await (supabase as any)
      .from('transactions')
      .update({ status: 'syncing', updated_at: new Date().toISOString() })
      .in('id', txIds)
      .eq('status', 'approved')
      .select('*');

    if (claimError || !claimed?.length) {
      return NextResponse.json({ ok: true, synced: 0, message: 'Transactions already being synced by another process' });
    }

    const bankAccountGLCode = '1010';
    const results = { synced: 0, failed: 0, errors: [] as string[] };

    // Refresh token before making API calls (Xero tokens expire after 30 minutes)
    let accessToken = conn.access_token;
    const tokenExpired = conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now();

    if (conn.refresh_token) {
      try {
        const refreshed = await refreshXeroToken(conn.refresh_token);
        accessToken = refreshed.accessToken;
        await (supabase as any)
          .from('ledger_connections')
          .update({
            access_token: refreshed.accessToken,
            refresh_token: refreshed.refreshToken,
            token_expires_at: new Date(Date.now() + (refreshed.expiresIn || 1800) * 1000).toISOString(),
          })
          .eq('id', conn.id);
      } catch (refreshError) {
        console.error('[Xero Sync] Token refresh failed:', refreshError);
        if (tokenExpired) {
          await (supabase as any).from('ledger_connections').update({ is_active: false }).eq('id', conn.id);
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
        const entry = buildJournalEntryFromTransaction(tx, bankAccountGLCode);

        const syncResult = await syncJournalEntry(
          'xero',
          { accessToken, tenantId: conn.tenant_id },
          entry
        );

        if (syncResult.success) {
          const { data: je } = await (supabase as any)
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
            await (supabase as any).from('journal_lines').insert(
              entry.lines.map((line) => ({
                journal_entry_id: je.id,
                gl_code: line.glCode,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
              }))
            );
          }

          await (supabase as any)
            .from('transactions')
            .update({ status: 'synced', updated_at: new Date().toISOString() })
            .eq('id', tx.id);

          results.synced++;

          await (supabase as any).from('audit_log').insert({
            entity_id: entityId,
            action: 'sync',
            target_type: 'transaction',
            target_id: tx.id,
            actor_type: 'system',
            details: { ledger: 'xero', journal_entry_id: syncResult.journalEntryId },
          });
        } else {
          results.failed++;
          results.errors.push(`${tx.id}: ${syncResult.error}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`${tx.id}: sync error`);
      }
    }

    // Reset any failed transactions back to 'approved' for retry
    if (results.failed > 0) {
      const { data: stillSyncing } = await (supabase as any)
        .from('transactions')
        .select('id')
        .in('id', txIds)
        .eq('status', 'syncing');
      if (stillSyncing?.length) {
        await (supabase as any)
          .from('transactions')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .in('id', stillSyncing.map((t: any) => t.id));
      }
    }

    await (supabase as any)
      .from('ledger_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', conn.id);

    return NextResponse.json({ ok: true, ...results });
  } catch (error) {
    return NextResponse.json(
      { error: 'Xero sync failed' },
      { status: 500 }
    );
  }
}

// GET /api/ledger/xero/sync — Sync Chart of Accounts from Xero
export async function GET(request: NextRequest) {
  try {
    const entityId = request.nextUrl.searchParams.get('entityId');
    if (!entityId) {
      return NextResponse.json({ error: 'Missing entityId' }, { status: 400 });
    }

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Org membership check
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization membership' }, { status: 403 });
    }

    // Verify entity belongs to user's org
    const { data: entity } = await (supabase as any).from('entities').select('org_id').eq('id', entityId).single();
    if (!entity || entity.org_id !== membership.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: conn } = await (supabase as any)
      .from('ledger_connections')
      .select('*')
      .eq('entity_id', entityId)
      .eq('provider', 'xero')
      .eq('is_active', true)
      .single();

    if (!conn) {
      return NextResponse.json({ error: 'No Xero connection' }, { status: 404 });
    }

    // Refresh token if expired (Xero tokens last 30 minutes)
    let accessToken = conn.access_token;
    const tokenExpired = conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now();

    if (conn.refresh_token && tokenExpired) {
      try {
        const refreshed = await refreshXeroToken(conn.refresh_token);
        accessToken = refreshed.accessToken;
        await (supabase as any)
          .from('ledger_connections')
          .update({
            access_token: refreshed.accessToken,
            refresh_token: refreshed.refreshToken,
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

    for (const acc of accounts) {
      await (supabase as any).from('chart_of_accounts').upsert(
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

    return NextResponse.json({ ok: true, accounts: accounts.length });
  } catch (error) {
    return NextResponse.json(
      { error: 'Xero chart of accounts sync failed' },
      { status: 500 }
    );
  }
}
