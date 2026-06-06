
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/weekly-digest — Compile & Send Weekly Financial Digest
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// PRD §4.2: Runs weekly (Fridays 4PM UTC).
// Compiles a digest of all transactions in escrow_suspense and human_review,
// sends via Resend email, and returns a summary.

import { NextRequest, NextResponse } from 'next/server';
import { compileWeeklyDigest } from '@/lib/notifications/digest';
import { sendDigestEmail } from '@/lib/email/resend';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';
import { withSentryHandler } from '@/lib/sentry';
import { handleApiError } from '@/lib/api-helpers';
import { writeAuditLog } from '@/lib/audit';
import { verifyCronAuth } from '@/lib/cron-auth';

async function handler(request: NextRequest) {
  try {
    // Verify cron secret (timing-safe)
    const cronError = verifyCronAuth(request);
    if (cronError) return cronError;

    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'cron-weekly-digest' });
    if (limited) return limited;

    const digest = await compileWeeklyDigest();

    // Log digest summary
    console.info('[Weekly Digest] Generated:', JSON.stringify({
      generatedAt: digest.generatedAt,
      totalEntities: digest.totalEntities,
      totalItems: digest.totalItems,
      totalValue: digest.totalValue,
    }));

    // ── Send Digest Emails via Resend ──────────────────────────────────────
    const emailResults: Array<{ entity: string; success: boolean; error?: string }> = [];

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    if (process.env.RESEND_API_KEY && digest.entities.length > 0) {

      // ── Batch: fetch all entities and their org_ids in one query ──────
      const entityIds = digest.entities.map(e => e.entityId);
      const { data: allEntities } = await db
        .from('entities')
        .select('id, org_id')
        .in('id', entityIds);

      const entityOrgMap = new Map<string, string>();
      for (const e of allEntities || []) {
        entityOrgMap.set(e.id as string, e.org_id as string);
      }

      // ── Batch: fetch all team members for all org_ids in one query ───
      const uniqueOrgIds = [...new Set(entityOrgMap.values())];
      const { data: allMembers } = await db
        .from('team_members')
        .select('user_id, role, org_id')
        .in('org_id', uniqueOrgIds)
        .in('role', ['owner', 'admin', 'accountant']);

      // Group members by org_id
      const membersByOrg = new Map<string, Array<{ user_id: string; role: string }>>();
      for (const m of allMembers || []) {
        const orgId = m.org_id as string;
        if (!membersByOrg.has(orgId)) membersByOrg.set(orgId, []);
        membersByOrg.get(orgId)!.push({ user_id: m.user_id as string, role: m.role as string });
      }

      // ── Batch: fetch all unique users in one parallel call ───────────
      const uniqueUserIds: string[] = Array.from(new Set((allMembers || []).map((m: Record<string, unknown>) => String(m.user_id))));
      const userResults = await Promise.all(
        uniqueUserIds.map((uid: string) => supabase.auth.admin.getUserById(uid))
      );
      const userEmailMap = new Map<string, string>();
      for (let i = 0; i < uniqueUserIds.length; i++) {
        const email = userResults[i].data?.user?.email;
        if (email) userEmailMap.set(uniqueUserIds[i] as string, email);
      }

      // ── Process entities using in-memory lookups ─────────────────────
      for (const entity of digest.entities) {
        const orgId = entityOrgMap.get(entity.entityId);
        if (!orgId) {
          console.warn(`[Weekly Digest] Entity not found: ${entity.entityId}`);
          emailResults.push({ entity: entity.entityName, success: false, error: 'Entity not found' });
          continue;
        }

        const members = membersByOrg.get(orgId);
        if (!members || members.length === 0) {
          console.warn(`[Weekly Digest] No admin users for entity ${entity.entityName}`);
          emailResults.push({ entity: entity.entityName, success: false, error: 'No admin users' });
          continue;
        }

        for (const member of members) {
          const userEmail = userEmailMap.get(member.user_id);
          if (!userEmail) continue;

          const result = await sendDigestEmail({
            to: userEmail,
            entityName: entity.entityName,
            itemCount: entity.itemCount,
            totalValue: entity.totalValue,
            escrowCount: entity.escrowCount,
            reviewCount: entity.humanReviewCount,
            topItems: entity.topItems.map(item => ({
              merchantName: item.merchant_name || 'Unknown',
              amount: item.amount,
              status: item.status,
            })),
            digestDate: new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }),
          });

          emailResults.push({
            entity: entity.entityName,
            success: result.success,
            error: result.error,
          });

          console.info(`[Weekly Digest] Email to ${userEmail}: ${result.success ? '✅ sent' : `❌ ${result.error}`}`);
        }
      }
    } else if (!process.env.RESEND_API_KEY) {
      console.info('[Weekly Digest] RESEND_API_KEY not configured, skipping email delivery');
    }

    // Audit log the cron run (reuse the db client created above)
    await writeAuditLog({
      supabase: db,
      entityId: undefined,
      actorId: 'system',
      actorType: 'system',
      action: 'sync',
      targetType: 'weekly_digest_cron',
      details: {
        totalEntities: digest.totalEntities,
        totalItems: digest.totalItems,
        emailsSent: emailResults.filter(r => r.success).length,
        emailsFailed: emailResults.filter(r => !r.success).length,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      digest,
      emailResults,
    });
  } catch (error) {
    return handleApiError(error, 'cron/weekly-digest', 'Weekly digest compilation failed');
  }
}

export const GET = withSentryHandler(handler, { routeName: 'cron/weekly-digest' });
