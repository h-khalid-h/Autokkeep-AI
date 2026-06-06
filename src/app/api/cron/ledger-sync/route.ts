
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/ledger-sync — Auto-Push Approved Transactions to Ledger
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Runs on a schedule (e.g. every 15 minutes).
// Finds all approved transactions that haven't been synced to the external
// ledger yet, and pushes them as journal entries to QuickBooks or Xero.

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { pushApprovedTransactionsToLedger } from '@/lib/ledger/auto-push';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { verifyCronAuth } from '@/lib/cron-auth';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (timing-safe)
    const cronError = verifyCronAuth(request);
    if (cronError) return cronError;

    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'cron-ledger-sync' });
    if (limited) return limited;

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    const result = await pushApprovedTransactionsToLedger(db);

    // Audit log the cron run
    await writeAuditLog({
      supabase: db,
      entityId: undefined,
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
    return handleApiError(error, 'cron/ledger-sync', 'Ledger sync cron failed');
  }
}
