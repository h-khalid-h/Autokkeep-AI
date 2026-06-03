
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plaid/exchange — Exchange Public Token & Setup Connection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { captureException } from '@/lib/sentry';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { checkPlanLimits } from '@/lib/billing/plans';
import { encryptToken } from '@/lib/crypto';
import { parseBody, schemas } from '@/lib/validation';
import {
  exchangePublicToken,
  getAccounts,
  getInstitution,
  syncTransactions,
} from '@/lib/plaid/client';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'plaid-exchange' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const result = await parseBody(request, schemas.plaidExchange);
    if (!result.success) return result.error;
    const { publicToken, entityId, institutionId } = result.data;

    // Validate entity access
    const { data: entity } = await db
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
    const planCheck = await checkPlanLimits(db as never, membership.org_id, 'connect_bank');
    if (!planCheck.allowed) {
      return NextResponse.json({ error: planCheck.reason, plan: planCheck.currentPlan }, { status: 403 });
    }

    // Exchange public token for access token
    const { accessToken, itemId } = await exchangePublicToken(publicToken);

    // Get institution details
    let institutionName = result.data.institutionName || 'Unknown Institution';
    if (institutionId) {
      try {
        const institution = await getInstitution(institutionId);
        institutionName = institution.name;
      } catch {
        console.warn(
          '[Plaid Exchange] Could not fetch institution details — using fallback name'
        );
      }
    }

    // Create bank_connection record
    const { data: connection, error: connectionError } = await db
      .from('bank_connections')
      .insert({
        entity_id: entityId,
        plaid_item_id: itemId,
        plaid_access_token: encryptToken(accessToken),
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
    const accountRecords = accounts.map((account) => ({
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
      const { error: accountsError } = await db
        .from('bank_accounts')
        .insert(accountRecords);

      if (accountsError) {
        console.error(
          '[Plaid Exchange] Failed to save accounts:',
          accountsError
        );
      }
    }

    // Build account ID mapping for transactions
    const accountIdMap = new Map<string, string>();
    if (accountRecords.length > 0) {
      const { data: savedAccounts } = await db
        .from('bank_accounts')
        .select('id, plaid_account_id')
        .eq('connection_id', connection.id);
      if (savedAccounts) {
        for (const ba of savedAccounts) {
          accountIdMap.set(ba.plaid_account_id, ba.id);
        }
      }
    }

    // Trigger initial transaction sync (non-fatal on failure)
    try {
      const syncResult = await syncTransactions(accessToken);

      // Update cursor on the connection
      await db
        .from('bank_connections')
        .update({
          cursor: syncResult.nextCursor,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      // Insert synced transactions
      if (syncResult.added.length > 0) {
        const transactionRecords = syncResult.added.map((t) => ({
          entity_id: entityId,
          bank_account_id: accountIdMap.get(t.account_id) || t.account_id,
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

        await db.from('transactions').upsert(transactionRecords, {
          onConflict: 'plaid_transaction_id',
          ignoreDuplicates: true,
        });
      }
    } catch (syncError) {
      console.error('[Plaid Exchange] Initial sync failed:', syncError);
      // Non-fatal: connection is still created successfully
    }

    // Log to audit
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'create',
      targetType: 'bank_connection',
      targetId: connection.id,
      details: {
        institution_name: institutionName,
        accounts_count: accounts.length,
      },
      request,
    });

    return NextResponse.json({
      connectionId: connection.id,
      accounts: accounts.map((a) => ({
        id: a.account_id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
      })),
    });
  } catch (error) {
    captureException(error, { tags: { route: 'plaid/exchange' } });
    console.error('[Plaid Exchange] Error:', error);
    return NextResponse.json(
      { error: 'Failed to exchange token and setup bank connection' },
      { status: 500 }
    );
  }
}
