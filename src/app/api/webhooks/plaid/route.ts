
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/webhooks/plaid — Plaid Webhook Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestTransactions } from '@/lib/plaid/ingest';
import { runAutoCategorize } from '@/lib/ai/auto-categorize';

import { importJWK, jwtVerify, decodeProtectedHeader } from 'jose';
import { writeAuditLog } from '@/lib/audit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';

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
      const plaidEnv = process.env.PLAID_ENV || 'sandbox';
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
    const limited = await rateLimit(request, { max: 100, windowSeconds: 60, prefix: 'webhook-plaid' });
    if (limited) return limited;

    const rawBody = await request.text();
    let body: PlaidWebhookBody;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { webhook_type, webhook_code, item_id } = body;

    console.info(
      `[Plaid Webhook] Received: ${webhook_type}.${webhook_code} for item ${item_id}`
    );

    // Verify webhook authenticity via Plaid-Verification JWT header
    const verificationHeader = request.headers.get('plaid-verification');
    const skipVerification = process.env.PLAID_SKIP_WEBHOOK_VERIFICATION === 'true';

    if (!skipVerification) {
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
    } else {
      // Verification explicitly skipped — still validate basic payload structure
      if (!body?.webhook_type || !body?.webhook_code || !body?.item_id) {
        return NextResponse.json(
          { error: 'Invalid webhook payload structure' },
          { status: 400 }
        );
      }
      console.warn('[Plaid Webhook] Verification skipped (PLAID_SKIP_WEBHOOK_VERIFICATION=true)');
    }

    if (!webhook_type || !item_id) {
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Find the bank connection for this Plaid item
    const { data: connection, error: connError } = await db
      .from('bank_connections')
      .select('id, entity_id, plaid_item_id, plaid_access_token, cursor, institution_name, status')
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
          const ingestResult = await ingestTransactions(supabase, connection);
          console.info(
            `[Plaid Webhook] Synced: +${ingestResult.added} ~${ingestResult.modified} -${ingestResult.removed}`
          );

          // Direct invocation: trigger auto-categorization for new transactions.
          // Previously this was an HTTP self-call (fetch to /api/cron/auto-categorize)
          // which is fragile in private network deployments (G18 fix).
          if (ingestResult.added > 0) {
            runAutoCategorize({ supabase }).catch((err) => {
              console.warn('[Plaid Webhook] Auto-categorize failed:', err instanceof Error ? err.message : 'unknown');
            });
          }
        } catch (syncError) {
          console.error('[Plaid Webhook] Sync failed:', syncError);
        }
        break;
      }

      // ── Item Errors ──────────────────────────────────────────────────────
      case 'ITEM.ERROR': {
        // Update connection status to error
        await db
          .from('bank_connections')
          .update({
            status: 'error',
            error_code: body.error?.error_code || 'UNKNOWN',
            error_message: body.error?.error_message || 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        // Log to audit
        await writeAuditLog({
          supabase: db,
          entityId: connection.entity_id,
          actorId: 'plaid',
          actorType: 'system',
          action: 'update',
          targetType: 'bank_connection',
          targetId: connection.id,
          details: {
            error_type: body.error?.error_type,
            error_code: body.error?.error_code,
            error_message: body.error?.error_message,
          },
          request,
        });

        console.error(
          `[Plaid Webhook] Item error for connection ${connection.id}:`,
          body.error
        );
        break;
      }

      // ── Item Credential Issues ────────────────────────────────────────
      case 'ITEM.PENDING_EXPIRATION': {
        // Credentials expiring soon — flag connection for re-authentication
        await db
          .from('bank_connections')
          .update({
            status: 'pending_expiration',
            error_message: 'Bank credentials expiring soon. Please re-authenticate.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        console.warn(
          `[Plaid Webhook] Credentials expiring for connection ${connection.id}`
        );
        break;
      }

      case 'ITEM.LOGIN_REQUIRED': {
        // User needs to re-authenticate
        await db
          .from('bank_connections')
          .update({
            status: 'login_required',
            error_message: 'Bank login required. Please re-authenticate your bank connection.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        console.warn(
          `[Plaid Webhook] Login required for connection ${connection.id}`
        );
        break;
      }

      case 'ITEM.USER_PERMISSION_REVOKED': {
        // User revoked access — deactivate connection
        await db
          .from('bank_connections')
          .update({
            status: 'revoked',
            error_message: 'Bank access was revoked by the account holder.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        await writeAuditLog({
          supabase: db,
          entityId: connection.entity_id,
          actorId: 'plaid',
          actorType: 'system',
          action: 'revoke',
          targetType: 'bank_connection',
          targetId: connection.id,
          details: { event: 'USER_PERMISSION_REVOKED' },
          request,
        });

        console.warn(
          `[Plaid Webhook] Access revoked for connection ${connection.id}`
        );
        break;
      }

      // ── Historical/Initial sync notifications ─────────────────────────
      case 'TRANSACTIONS.INITIAL_UPDATE':
      case 'TRANSACTIONS.HISTORICAL_UPDATE': {
        try {
          const ingestResult = await ingestTransactions(supabase, connection);
          console.info(
            `[Plaid Webhook] ${webhook_code} sync: +${ingestResult.added} ~${ingestResult.modified} -${ingestResult.removed}`
          );

          // Direct invocation (G18 fix — no HTTP self-call)
          if (ingestResult.added > 0) {
            runAutoCategorize({ supabase }).catch((err) => {
              console.warn('[Plaid Webhook] Auto-categorize failed:', err instanceof Error ? err.message : 'unknown');
            });
          }
        } catch (syncError) {
          console.error(`[Plaid Webhook] ${webhook_code} sync failed:`, syncError);
        }
        break;
      }

      default:
        console.info(
          `[Plaid Webhook] Unhandled event: ${webhook_type}.${webhook_code}`
        );
    }

    // Audit log the webhook event
    await writeAuditLog({
      supabase: db,
      entityId: connection?.entity_id || 'unknown',
      actorId: 'plaid',
      actorType: 'system',
      action: `webhook.${webhook_type}.${webhook_code}`,
      targetType: 'bank_connection',
      targetId: connection?.id,
      details: { webhook_type, webhook_code, item_id },
      request,
    });

    // Always return 200 for webhooks
    return NextResponse.json({ received: true });
  } catch (error) {
    captureException(error, { tags: { route: 'webhooks/plaid' } });
    console.error('[Plaid Webhook] Error:', error);
    // Always return 200 for webhooks to prevent retries on our errors
    return NextResponse.json({ received: true });
  }
}
