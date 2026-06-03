
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/cron/auto-categorize — Automated AI Transaction Categorization (Cron)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// This route is a thin HTTP wrapper around runAutoCategorize().
// Core logic lives in src/lib/ai/auto-categorize.ts for direct invocation.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { runAutoCategorize } from '@/lib/ai/auto-categorize';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
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
    captureException(error, { tags: { route: 'cron/auto-categorize' } });
    console.error('[Cron Auto-Categorize] Error:', error);
    return NextResponse.json(
      { error: 'Auto-categorization cron failed' },
      { status: 500 }
    );
  }
}

// Vercel crons send GET — delegate to POST handler
export async function GET(request: NextRequest) {
  return POST(request);
}
