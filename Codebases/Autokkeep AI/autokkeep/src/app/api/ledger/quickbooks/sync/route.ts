import { NextRequest, NextResponse } from 'next/server';
import { checkPlanLimits } from '@/lib/billing/plans';
import {
  syncJournalEntry,
  syncChartOfAccounts,
  buildJournalEntryFromTransaction,
  refreshQBOToken,
} from '@/lib/ledger/sync';

// POST /api/ledger/quickbooks/sync — Sync approved transactions to QuickBooks
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

    // Enforce plan limits
    const planCheck = await checkPlanLimits(supabase as any, membership.org_id, 'sync_ledger');
    if (!planCheck.allowed) {
      return NextResponse.json({ error: planCheck.reason, plan: planCheck.currentPlan }, { status: 403 });
    }

    // Get QBO connection
    const { data: conn } = await (supabase as any)
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

    // Get approved transactions that haven't been synced
    let query = (supabase as any)
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

    // Get the bank account GL code (default: 1010 - Checking)
    const bankAccountGLCode = '1010';

    const results = {
      synced: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Refresh token before making API calls (QBO tokens expire after 1 hour)
    let accessToken = conn.access_token;
    if (conn.refresh_token) {
      try {
        const refreshed = await refreshQBOToken(conn.refresh_token);
        accessToken = refreshed.accessToken;
        // Persist refreshed tokens
        await (supabase as any)
          .from('ledger_connections')
          .update({
            access_token: refreshed.accessToken,
            refresh_token: refreshed.refreshToken,
          })
          .eq('id', conn.id);
      } catch (refreshError) {
        console.warn('[QBO Sync] Token refresh failed, using existing token:', refreshError);
      }
    }

    for (const tx of transactions) {
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
              ledger_type: 'quickbooks',
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

          // Update transaction status
          await (supabase as any)
            .from('transactions')
            .update({ status: 'synced', updated_at: new Date().toISOString() })
            .eq('id', tx.id);

          results.synced++;

          // Audit log
          await (supabase as any).from('audit_log').insert({
            entity_id: entityId,
            action: 'sync',
            target_type: 'transaction',
            target_id: tx.id,
            actor_type: 'system',
            details: {
              ledger: 'quickbooks',
              journal_entry_id: syncResult.journalEntryId,
              doc_number: syncResult.docNumber,
            },
          });
        } else {
          results.failed++;
          results.errors.push(`${tx.id}: ${syncResult.error}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(
          `${tx.id}: sync error`
        );
      }
    }

    // Update last synced timestamp
    await (supabase as any)
      .from('ledger_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', conn.id);

    return NextResponse.json({
      ok: true,
      ...results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'QuickBooks sync failed' },
      { status: 500 }
    );
  }
}

// GET /api/ledger/quickbooks/sync — Sync Chart of Accounts from QBO
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
      .eq('provider', 'quickbooks')
      .eq('is_active', true)
      .single();

    if (!conn) {
      return NextResponse.json({ error: 'No QBO connection' }, { status: 404 });
    }

    const accounts = await syncChartOfAccounts('quickbooks', {
      accessToken: conn.access_token,
      realmId: conn.realm_id,
    });

    // Upsert chart of accounts
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

    return NextResponse.json({
      ok: true,
      accounts: accounts.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'QuickBooks chart of accounts sync failed' },
      { status: 500 }
    );
  }
}
