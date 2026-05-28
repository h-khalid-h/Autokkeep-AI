
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/weekly-digest — Compile & Send Weekly CPA Digest
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// PRD §4.2: Runs weekly (Fridays 4PM UTC).
// Compiles a digest of all transactions in escrow_suspense and human_review,
// sends via Resend email, and returns a summary.

import { NextRequest, NextResponse } from 'next/server';
import { compileWeeklyDigest } from '@/lib/notifications/digest';
import { sendDigestEmail } from '@/lib/email/resend';
import { createAdminClient } from '@/lib/supabase/admin';

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
    console.log('[Weekly Digest] Generated:', JSON.stringify({
      generatedAt: digest.generatedAt,
      totalEntities: digest.totalEntities,
      totalItems: digest.totalItems,
      totalValue: digest.totalValue,
    }));

    // ── Send Digest Emails via Resend ──────────────────────────────────────
    const emailResults: Array<{ entity: string; success: boolean; error?: string }> = [];

    if (process.env.RESEND_API_KEY && digest.entities.length > 0) {
      const supabase = createAdminClient();

      for (const entity of digest.entities) {
        // Get admin/owner users for this entity
        const { data: members } = await supabase
          .from('entity_memberships')
          .select('user_id, role, users:user_id(email)')
          .eq('entity_id', entity.entityId)
          .in('role', ['owner', 'admin']);

        if (!members || members.length === 0) {
          console.log(`[Weekly Digest] No admin users for entity ${entity.entityName}`);
          emailResults.push({ entity: entity.entityName, success: false, error: 'No admin users' });
          continue;
        }

        for (const member of members) {
          const userEmail = (member.users as unknown as { email: string })?.email;
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

          console.log(`[Weekly Digest] Email to ${userEmail}: ${result.success ? '✅ sent' : `❌ ${result.error}`}`);
        }
      }
    } else if (!process.env.RESEND_API_KEY) {
      console.log('[Weekly Digest] RESEND_API_KEY not configured, skipping email delivery');
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
