
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/webhooks/plaid — Plaid Webhook Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncTransactions } from '@/lib/plaid/client';
import { importJWK, jwtVerify, decodeProtectedHeader } from 'jose';

// ─── Plaid Webhook JWT Verification ─────────────────────────────────────────
// Plaid signs webhooks with ES256 JWTs. We verify the signature using
// the public key fetched from Plaid's /webhook_verification_key/get endpoint.
// Keys are cached in memory to avoid API calls on every webhook.
// See: https://plaid.com/docs/api/webhooks/webhook-verification/

type VerificationKey = Awaited<ReturnType<typeof importJWK>>;
const keyCache = new Map<string, VerificationKey>();
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const keyCacheTimestamps = new Map<string, number>();

async function verifyPlaidWebhook(
  token: string,
  rawBody: string
): Promise<boolean> {
  try {
    // 1. Decode the JWT header to get the key ID (kid)
    const header = decodeProtectedHeader(token);
    const kid = header.kid;
    if (!kid) return false;

    // 2. Get the verification key (cached or fresh)
    let key = keyCache.get(kid);
    const cachedAt = keyCacheTimestamps.get(kid) || 0;
    if (!key || Date.now() - cachedAt > KEY_CACHE_TTL_MS) {
      // Fetch from Plaid API (use environment-specific URL)
      const plaidEnv = process.env.PLAID_ENV || 'production';
      const plaidHost = plaidEnv === 'sandbox' ? 'sandbox' : plaidEnv === 'development' ? 'development' : 'production';
      const response = await fetch(
        `https://${plaidHost}.plaid.com/webhook_verification_key/get`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: process.env.PLAID_CLIENT_ID,
            secret: process.env.PLAID_SECRET,
            key_id: kid,
          }),
        }
      );

      if (!response.ok) {
        console.error('[Plaid Webhook] Failed to fetch verification key');
        return false;
      }

      const data = await response.json();
      key = await importJWK(data.key, 'ES256');
      keyCache.set(kid, key);
      keyCacheTimestamps.set(kid, Date.now());
    }

    // 3. Verify the JWT signature (algorithm restricted to ES256)
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['ES256'],
    });

    // 4. Check that webhook is not older than 5 minutes (replay prevention)
    const iat = payload.iat;
    if (!iat || Date.now() / 1000 - iat > 300) {
      console.warn('[Plaid Webhook] JWT expired (iat too old)');
      return false;
    }

    // 5. Verify request body hash matches the JWT claim
    const bodyHash = payload.request_body_sha256;
    if (bodyHash) {
      const encoder = new TextEncoder();
      const data = encoder.encode(rawBody);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      if (computedHash !== bodyHash) {
        console.warn('[Plaid Webhook] Body hash mismatch');
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('[Plaid Webhook] JWT verification failed:', error);
    return false;
  }
}

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
    const rawBody = await request.text();
    let body: PlaidWebhookBody;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { webhook_type, webhook_code, item_id } = body;

    console.log(
      `[Plaid Webhook] Received: ${webhook_type}.${webhook_code} for item ${item_id}`
    );

    // Verify webhook authenticity via Plaid-Verification JWT header
    const verificationHeader = request.headers.get('plaid-verification');
    if (process.env.NODE_ENV === 'production') {
      if (!verificationHeader) {
        console.warn('[Plaid Webhook] Missing Plaid-Verification header — rejecting');
        return NextResponse.json(
          { error: 'Missing verification header' },
          { status: 401 }
        );
      }

      const isValid = await verifyPlaidWebhook(verificationHeader, rawBody);
      if (!isValid) {
        console.warn('[Plaid Webhook] JWT verification failed — rejecting');
        return NextResponse.json(
          { error: 'Invalid webhook signature' },
          { status: 401 }
        );
      }
    } else if (!verificationHeader) {
      console.warn('[Plaid Webhook] No verification header (non-production — allowing)');
    }

    if (!webhook_type || !item_id) {
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      );
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

          // Handle removed transactions (batch soft delete)
          if (syncResult.removed.length > 0) {
            const removedIds = syncResult.removed.map((t: Record<string, any>) => t.transaction_id);
            await (supabase as any)
              .from('transactions')
              .update({
                status: 'removed',
                updated_at: new Date().toISOString(),
              })
              .in('plaid_transaction_id', removedIds)
              .eq('entity_id', connection.entity_id);
          }

          // Handle modified transactions — clear AI categorization for re-processing
          // (per-row update needed due to different values per row)
          for (const t of syncResult.modified) {
            await (supabase as any)
              .from('transactions')
              .update({
                amount: t.amount,
                date: t.date,
                merchant_name: t.merchant_name || t.name,
                merchant_raw: t.name,
                // Reset AI categorization so the transaction gets re-categorized
                category_ai: null,
                confidence: 0,
                ai_reasoning: null,
                status: 'pending',
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
