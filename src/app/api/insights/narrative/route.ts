
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET  /api/insights/narrative — Fetch or generate monthly narrative
// POST /api/insights/narrative — Force regeneration of narrative
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { generateMonthlyNarrative } from '@/lib/ai/narrative';
import { rateLimit } from '@/lib/rate-limit';
import type { FinancialNarrative } from '@/lib/ai/narrative';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function validateMonthYear(yearStr: string | null, monthStr: string | null): { year: number; month: number } | null {
  if (!yearStr || !monthStr) return null;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month)) return null;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  return { year, month };
}

// ─── GET: Fetch or generate narrative ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    // Rate limit: 15 requests per minute
    const limited = await rateLimit(request, { max: 15, windowSeconds: 60, prefix: 'narrative-get' });
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const yearStr = searchParams.get('year');
    const monthStr = searchParams.get('month');

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId is required' },
        { status: 400 }
      );
    }

    const period = validateMonthYear(yearStr, monthStr);
    if (!period) {
      return NextResponse.json(
        { error: 'Valid year and month are required (e.g., year=2026&month=5)' },
        { status: 400 }
      );
    }

    // Validate entity access against org
    const { data: entity } = await db
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Check for cached narrative
    const { data: existing } = await db
      .from('financial_narratives')
      .select('narrative_data, generated_at')
      .eq('entity_id', entityId)
      .eq('year', period.year)
      .eq('month', period.month)
      .single();

    if (existing?.narrative_data) {
      return NextResponse.json({
        narrative: existing.narrative_data as FinancialNarrative,
        cached: true,
        generatedAt: existing.generated_at,
      });
    }

    // No cached version — generate new narrative
    const narrative = await generateMonthlyNarrative(
      entityId,
      period.year,
      period.month,
      db
    );

    return NextResponse.json({
      narrative,
      cached: false,
      generatedAt: narrative.generatedAt,
    });
  } catch (error) {
    console.error('[Narrative API] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch narrative' },
      { status: 500 }
    );
  }
}

// ─── POST: Force regeneration ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 requests per minute (narrative generation is expensive)
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'narrative-gen' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const body = await request.json();
    const { entityId, year, month } = body as {
      entityId?: string;
      year?: number;
      month?: number;
    };

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId is required' },
        { status: 400 }
      );
    }

    const period = validateMonthYear(
      year !== undefined ? String(year) : null,
      month !== undefined ? String(month) : null
    );
    if (!period) {
      return NextResponse.json(
        { error: 'Valid year and month are required' },
        { status: 400 }
      );
    }

    // Validate entity access against org
    const { data: entity } = await db
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Force regeneration
    const narrative = await generateMonthlyNarrative(
      entityId,
      period.year,
      period.month,
      db
    );

    return NextResponse.json({
      narrative,
      cached: false,
      generatedAt: narrative.generatedAt,
    });
  } catch (error) {
    console.error('[Narrative API] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate narrative' },
      { status: 500 }
    );
  }
}
