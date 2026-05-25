
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plaid/exchange — Exchange Public Token & Setup Connection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { checkPlanLimits } from '@/lib/billing/plans';
import {
  exchangePublicToken,
  getAccounts,
  getInstitution,
  syncTransactions,
} from '@/lib/plaid/client';

interface ExchangeRequestBody {
  publicToken: string;
  entityId: string;
  institutionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ExchangeRequestBody = await request.json();
    const { publicToken, entityId, institutionId } = body;

    if (!publicToken || !entityId) {
      return NextResponse.json(
        { error: 'publicToken and entityId are required' },
        { status: 400 }
      );
    }

    // Validate entity access
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Entity access denied' },
        { status: 403 }
      );
    }

    const { data: entity } = await (supabase as any)
      .from('entities')
      .select('id, org_id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Enforce plan limits
    const planCheck = await checkPlanLimits(supabase as any, membership.org_id, 'connect_bank');
    if (!planCheck.allowed) {
      return NextResponse.json({ error: planCheck.reason, plan: planCheck.currentPlan }, { status: 403 });
    }

    // Exchange public token for access token
    const { accessToken, itemId } = await exchangePublicToken(publicToken);

    // Get institution details
    let institutionName = 'Unknown Institution';
    if (institutionId) {
      try {
        const institution = await getInstitution(institutionId);
        institutionName = institution.name;
      } catch {
        console.warn(
          '[Plaid Exchange] Could not fetch institution details'
        );
      }
    }

    // Create bank_connection record
    const { data: connection, error: connectionError } = await (supabase as any)
      .from('bank_connections')
      .insert({
        entity_id: entityId,
        plaid_item_id: itemId,
        plaid_access_token: accessToken,
        institution_name: institutionName,
        status: 'active',
        cursor: null,
      })
      .select()
      .single();

    if (connectionError) {
      console.error(
        '[Plaid Exchange] Failed to create connection:',
        connectionError
      );
      return NextResponse.json(
        { error: 'Failed to save bank connection' },
        { status: 500 }
      );
    }

    // Get accounts and create bank_account records
    const accounts = await getAccounts(accessToken);
    const accountRecords = accounts.map((account: Record<string, any>) => ({
      connection_id: connection.id,
      plaid_account_id: account.account_id,
      name: account.name,
      type: account.type,
      subtype: account.subtype || null,
      mask: account.mask || null,
      current_balance: account.balances.current,
      available_balance: account.balances.available,
    }));

    if (accountRecords.length > 0) {
      const { error: accountsError } = await (supabase as any)
        .from('bank_accounts')
        .insert(accountRecords);

      if (accountsError) {
        console.error(
          '[Plaid Exchange] Failed to save accounts:',
          accountsError
        );
      }
    }

    // Trigger initial transaction sync (non-fatal on failure)
    try {
      const syncResult = await syncTransactions(accessToken);

      // Update cursor on the connection
      await (supabase as any)
        .from('bank_connections')
        .update({
          cursor: syncResult.nextCursor,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      // Insert synced transactions
      if (syncResult.added.length > 0) {
        const transactionRecords = syncResult.added.map((t: Record<string, any>) => ({
          entity_id: entityId,
          bank_account_id: t.account_id,
          plaid_transaction_id: t.transaction_id,
          amount: t.amount,
          date: t.date,
          merchant_name: t.merchant_name || t.name,
          merchant_raw: t.name,
          currency: t.iso_currency_code || 'USD',
          status: 'pending',
          confidence: 0,
          category_ai: null,
        }));

        await (supabase as any).from('transactions').upsert(transactionRecords, {
          onConflict: 'plaid_transaction_id',
          ignoreDuplicates: true,
        });
      }
    } catch (syncError) {
      console.error('[Plaid Exchange] Initial sync failed:', syncError);
      // Non-fatal: connection is still created successfully
    }

    // Log to audit
    await (supabase as any).from('audit_log').insert({
      entity_id: entityId,
      actor_id: user.id,
      actor_type: 'human',
      action: 'create',
      target_type: 'bank_connection',
      target_id: connection.id,
      details: {
        institution_name: institutionName,
        accounts_count: accounts.length,
      },
    });

    return NextResponse.json({
      connectionId: connection.id,
      accounts: accounts.map((a: Record<string, any>) => ({
        id: a.account_id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
      })),
    });
  } catch (error) {
    console.error('[Plaid Exchange] Error:', error);
    return NextResponse.json(
      { error: 'Failed to exchange token and setup bank connection' },
      { status: 500 }
    );
  }
}
