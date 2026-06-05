
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/cron/auto-categorize — Automated AI Transaction Categorization (Cron)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// This route is a thin HTTP wrapper around runAutoCategorize().
// Core logic lives in src/lib/ai/auto-categorize.ts for direct invocation.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { withSentryHandler } from '@/lib/sentry';
import { handleApiError } from '@/lib/api-helpers';
import { runAutoCategorize } from '@/lib/ai/auto-categorize';
import { rateLimit } from '@/lib/rate-limit';

async function handler(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'cron-auto-categorize' });
    if (limited) return limited;

    const result = await runAutoCategorize();

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'cron/auto-categorize', 'Auto-categorization cron failed');
  }
}

export const POST = withSentryHandler(handler, { routeName: 'cron/auto-categorize' });

// Vercel crons send GET — delegate to POST handler
export const GET = withSentryHandler(handler, { routeName: 'cron/auto-categorize' });
