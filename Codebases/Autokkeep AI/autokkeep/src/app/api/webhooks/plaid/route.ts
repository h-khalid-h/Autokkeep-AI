
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/webhooks/plaid — Plaid Webhook Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncTransactions } from '@/lib/plaid/client';

// Plaid webhook event types
interface PlaidWebhookBody {
  webhook_type: string;
  webhook_code: string;
  item_id: string;
  error?: {
    error_type: string;
    error_code: string;
    error_message: string;
  };
  new_transactions?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: PlaidWebhookBody = await request.json();
    const { webhook_type, webhook_code, item_id } = body;

    console.log(
      `[Plaid Webhook] Received: ${webhook_type}.${webhook_code} for item ${item_id}`
    );

    // Verify webhook structure
    // In production, verify the Plaid-Verification header using
    // Plaid's webhook verification endpoint for security.
    if (!webhook_type || !item_id) {
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      );
    }

    // Verify Plaid webhook
    const plaidVerifyKey = process.env.PLAID_WEBHOOK_VERIFY_KEY;
    if (plaidVerifyKey) {
      const receivedToken = request.headers.get('plaid-verification');
      // In production, use plaid-node's webhookVerificationKeyGet to verify
      // For now, log if header is missing
      if (!receivedToken) {
        console.warn('[Plaid Webhook] No verification header received');
      }
    }

    const supabase = createAdminClient();

    // Find the bank connection for this Plaid item
    const { data: connection, error: connError } = await (supabase as any)
      .from('bank_connections')
      .select('*')
      .eq('plaid_item_id', item_id)
      .single();

    if (connError || !connection) {
      console.error(
        `[Plaid Webhook] No connection found for item_id: ${item_id}`
      );
      // Return 200 to acknowledge receipt even if we can't process
      return NextResponse.json({ received: true });
    }

    switch (`${webhook_type}.${webhook_code}`) {
      // ── Transaction Updates ──────────────────────────────────────────────
      case 'TRANSACTIONS.SYNC_UPDATES_AVAILABLE':
      case 'TRANSACTIONS.DEFAULT_UPDATE': {
        try {
          const syncResult = await syncTransactions(
            connection.plaid_access_token,
            connection.cursor || undefined
          );

          // Insert new transactions
          if (syncResult.added.length > 0) {
            const transactionRecords = syncResult.added.map((t: Record<string, any>) => ({
              entity_id: connection.entity_id,
              bank_account_id: t.account_id,
              plaid_transaction_id: t.transaction_id,
              amount: t.amount,
              date: t.date,
              merchant_name: t.merchant_name || t.name,
              merchant_raw: t.name,
              currency: t.iso_currency_code || 'USD',
              status: 'pending',
              confidence: 0,
            }));

            const { error: upsertError } = await (supabase as any).from('transactions').upsert(transactionRecords, {
              onConflict: 'plaid_transaction_id',
              ignoreDuplicates: true,
            });

            if (upsertError) {
              console.error('[Plaid Webhook] Transaction upsert failed:', upsertError);
            }
          }

          // Handle removed transactions (soft delete)
          for (const t of syncResult.removed) {
            await (supabase as any)
              .from('transactions')
              .update({
                status: 'removed',
                updated_at: new Date().toISOString(),
              })
              .eq('plaid_transaction_id', t.transaction_id)
              .eq('entity_id', connection.entity_id);
          }

          // Handle modified transactions
          for (const t of syncResult.modified) {
            await (supabase as any)
              .from('transactions')
              .update({
                amount: t.amount,
                date: t.date,
                merchant_name: t.merchant_name || t.name,
                merchant_raw: t.name,
                updated_at: new Date().toISOString(),
              })
              .eq('plaid_transaction_id', t.transaction_id)
              .eq('entity_id', connection.entity_id);
          }

          // Update cursor AFTER all transaction processing
          await (supabase as any)
            .from('bank_connections')
            .update({
              cursor: syncResult.nextCursor,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', connection.id);

          console.log(
            `[Plaid Webhook] Synced: +${syncResult.added.length} ~${syncResult.modified.length} -${syncResult.removed.length}`
          );
        } catch (syncError) {
          console.error('[Plaid Webhook] Sync failed:', syncError);
        }
        break;
      }

      // ── Item Errors ──────────────────────────────────────────────────────
      case 'ITEM.ERROR': {
        // Update connection status to error
        await (supabase as any)
          .from('bank_connections')
          .update({
            status: 'error',
            error_code: body.error?.error_code || 'UNKNOWN',
            error_message: body.error?.error_message || 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        // Log to audit
        await (supabase as any).from('audit_log').insert({
          entity_id: connection.entity_id,
          action: 'update',
          actor_type: 'system',
          target_type: 'bank_connection',
          target_id: connection.id,
          details: {
            error_type: body.error?.error_type,
            error_code: body.error?.error_code,
            error_message: body.error?.error_message,
          },
        });

        console.error(
          `[Plaid Webhook] Item error for connection ${connection.id}:`,
          body.error
        );
        break;
      }

      default:
        console.log(
          `[Plaid Webhook] Unhandled event: ${webhook_type}.${webhook_code}`
        );
    }

    // Always return 200 for webhooks
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Plaid Webhook] Error:', error);
    // Always return 200 for webhooks to prevent retries on our errors
    return NextResponse.json({ received: true });
  }
}
