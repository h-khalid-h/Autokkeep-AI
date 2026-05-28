
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/weekly-digest — Compile & Log Weekly CPA Digest
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Runs on a weekly schedule (e.g. every Monday at 8 AM).
// Compiles a digest of all transactions in escrow_suspense and human_review,
// logs it, and returns a summary. Email/Slack delivery can be added later.

import { NextRequest, NextResponse } from 'next/server';
import { compileWeeklyDigest } from '@/lib/notifications/digest';

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

    for (const entity of digest.entities) {
      console.log(`[Weekly Digest] Entity "${entity.entityName}": ${entity.itemCount} items, $${entity.totalValue.toFixed(2)} total`);
    }

    // TODO: Send via email (SendGrid / Resend) or Slack when configured
    // TODO: Store digest in database for historical reference

    return NextResponse.json({
      success: true,
      digest,
    });
  } catch (error) {
    console.error('[Weekly Digest] Error:', error);
    return NextResponse.json(
      { error: 'Weekly digest compilation failed' },
      { status: 500 }
    );
  }
}
