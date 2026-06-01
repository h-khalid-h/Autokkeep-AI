
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

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    if (process.env.RESEND_API_KEY && digest.entities.length > 0) {
      const supabase = createAdminClient();
      const db = supabase as unknown as SupabaseQueryClient;

      for (const entity of digest.entities) {
        // Get entity's org_id, then find admin/owner team members
        const { data: entityRecord } = await db
          .from('entities')
          .select('org_id')
          .eq('id', entity.entityId)
          .single();

        if (!entityRecord) {
          console.warn(`[Weekly Digest] Entity not found: ${entity.entityId}`);
          emailResults.push({ entity: entity.entityName, success: false, error: 'Entity not found' });
          continue;
        }

        const { data: members } = await db
          .from('team_members')
          .select('user_id, role')
          .eq('org_id', entityRecord.org_id)
          .in('role', ['owner', 'admin']);

        if (!members || members.length === 0) {
          console.warn(`[Weekly Digest] No admin users for entity ${entity.entityName}`);
          emailResults.push({ entity: entity.entityName, success: false, error: 'No admin users' });
          continue;
        }

        for (const member of members) {
          const { data: { user: memberUser } } = await supabase.auth.admin.getUserById(member.user_id);
          const userEmail = memberUser?.email;
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

    return NextResponse.json({
      success: true,
      digest,
      emailResults,
    });
  } catch (error) {
    console.error('[Weekly Digest] Error:', error);
    return NextResponse.json(
      { error: 'Weekly digest compilation failed' },
      { status: 500 }
    );
  }
}
