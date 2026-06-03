// POST /api/account/delete — Delete user account and all associated data
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getApiAuthContext } from '@/lib/api-auth';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import { decryptToken } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 3, windowSeconds: 60, prefix: 'account-delete' });
    if (limited) return limited;

    // Use getApiAuthContext only for auth verification (user identity)
    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user } = ctx;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (body.confirmation !== 'DELETE') {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const db = admin as unknown as SupabaseQueryClient;

    // 1. Find user's org memberships (uses admin client to iterate ALL memberships)
    const { data: memberships } = await db
      .from('team_members')
      .select('org_id, role')
      .eq('user_id', user.id);

    if (memberships) {
      for (const membership of memberships) {
        if (membership.role === 'owner') {
          // Check if org has other members
          const { count } = await db
            .from('team_members')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', membership.org_id)
            .neq('user_id', user.id);

          if ((count ?? 0) === 0) {
            // User is sole owner — delete the entire org (cascades delete everything)
            // Get all entity IDs first for storage cleanup
            const { data: entities } = await db
              .from('entities')
              .select('id')
              .eq('org_id', membership.org_id);

            // Clean up storage (receipts) - list then remove
            if (entities) {
              for (const entity of entities) {
                try {
                  const { data: files } = await db.storage
                    .from('documents')
                    .list(`receipts/${entity.id}`);
                  if (files?.length) {
                    const filePaths = files.map((f: { name: string }) => `receipts/${entity.id}/${f.name}`);
                    await db.storage.from('documents').remove(filePaths);
                  }
                } catch {
                  // Storage cleanup is best-effort
                }
              }
            }

            // Revoke Plaid access tokens (privacy compliance)
            const { data: bankConns } = await db
              .from('bank_connections')
              .select('plaid_access_token')
              .in('entity_id', entities?.map((e: { id: string }) => e.id) || []);

            if (bankConns) {
              const { removeItem } = await import('@/lib/plaid/client');
              for (const conn of bankConns) {
                if (conn.plaid_access_token) {
                  let token = conn.plaid_access_token;
                  try {
                    token = decryptToken(token);
                  } catch {
                    // Token may not be encrypted or decryption key unavailable — use as-is
                  }
                  await removeItem(token);
                }
              }
            }

            // Revoke ledger OAuth tokens (QBO/Xero)
            const { data: ledgerConns } = await db
              .from('ledger_connections')
              .select('provider, access_token')
              .in('entity_id', entities?.map((e: { id: string }) => e.id) || []);

            if (ledgerConns) {
              for (const conn of ledgerConns) {
                try {
                  if (conn.provider === 'quickbooks' && conn.access_token) {
                    let qboToken = conn.access_token;
                    try {
                      qboToken = decryptToken(qboToken);
                    } catch {
                      // Token may not be encrypted — use as-is
                    }
                    // QBO token revocation
                    await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ token: qboToken }),
                    });
                  }
                  // Xero tokens auto-expire in 30 min; no revocation endpoint needed
                } catch {
                  // Token revocation is best-effort
                }
              }
            }

            // Cancel Stripe subscription before deleting org
            const { data: orgSub } = await db
              .from('subscriptions')
              .select('stripe_subscription_id')
              .eq('org_id', membership.org_id)
              .single();

            if (orgSub?.stripe_subscription_id) {
              const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
                apiVersion: '2026-05-27.dahlia',
              });
              await stripe.subscriptions.cancel(orgSub.stripe_subscription_id);
            }

            // Delete org — all child tables cascade
            await db
              .from('organizations')
              .delete()
              .eq('id', membership.org_id);
          } else {
            // Has other members — just remove this user's membership
            await db
              .from('team_members')
              .delete()
              .eq('org_id', membership.org_id)
              .eq('user_id', user.id);
          }
        } else {
          // Not owner — just remove membership
          await db
            .from('team_members')
            .delete()
            .eq('org_id', membership.org_id)
            .eq('user_id', user.id);
        }
      }
    }

    // 2. Delete the auth user (requires admin client)
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('[Account Delete] Failed to delete auth user:', deleteError);
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }

    // 3. Log the deletion (user is already gone, log with system actor)
    await writeAuditLog({
      supabase: admin,
      actorType: 'system',
      action: 'delete',
      targetType: 'user',
      targetId: user.id,
      details: {
        action: 'account_deletion',
        email: user.email,
        memberships_removed: memberships?.length || 0,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Account Delete] Error:', error);
    captureException(error);
    return NextResponse.json({ error: 'Account deletion failed' }, { status: 500 });
  }
}
