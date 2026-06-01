
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/ledger-sync — Auto-Push Approved Transactions to Ledger
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Runs on a schedule (e.g. every 15 minutes).
// Finds all approved transactions that haven't been synced to the external
// ledger yet, and pushes them as journal entries to QuickBooks or Xero.

import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { pushApprovedTransactionsToLedger } from '@/lib/ledger/auto-push';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    const result = await pushApprovedTransactionsToLedger(db);

    // Audit log the cron run
    await writeAuditLog({
      supabase: db,
      entityId: 'system',
      actorId: 'system',
      actorType: 'system',
      action: 'sync',
      targetType: 'ledger_sync',
      details: {
        pushed: result.pushed,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors.slice(0, 10), // Cap logged errors
      },
      request,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    captureException(error, { tags: { route: 'cron/ledger-sync' } });
    console.error('[Cron Ledger Sync] Error:', error);
    return NextResponse.json(
      { error: 'Ledger sync cron failed' },
      { status: 500 }
    );
  }
}
