import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { parseQuery } from '@/lib/validation';
import { suggestCategorizationRules } from '@/lib/rules/suggestion-engine';
import { z } from 'zod';

const querySchema = z.object({
  entityId: z.string().uuid(),
});

/**
 * GET /api/transactions/rule-suggestions?entityId=...
 *
 * Analyzes the last 6 months of human-categorized transactions for an entity
 * and returns suggested categorization rules based on recurring patterns.
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'rule-suggestions' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    // Validate query params
    const parsed = parseQuery(request.nextUrl.searchParams, querySchema);
    if (!parsed.success) return parsed.error;
    const { entityId } = parsed.data;

    // Verify entity belongs to user's org
    const { data: entity } = await db
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 403 });
    }

    // Fetch last 6 months of human-categorized transactions
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoffDate = sixMonthsAgo.toISOString().split('T')[0];

    const { data: transactions, error: txError } = await db
      .from('transactions')
      .select('merchant_name, category_human, category_ai')
      .eq('entity_id', entityId)
      .not('category_human', 'is', null)
      .gte('date', cutoffDate)
      .order('date', { ascending: false });

    if (txError) {
      console.error('[rule-suggestions] Failed to fetch transactions:', txError);
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }

    // Fetch existing rules for the entity
    const { data: existingRules, error: rulesError } = await db
      .from('categorization_rules')
      .select('match_value, gl_code')
      .eq('entity_id', entityId);

    if (rulesError) {
      console.error('[rule-suggestions] Failed to fetch rules:', rulesError);
      return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
    }

    // Run the suggestion engine
    const suggestions = suggestCategorizationRules(
      (transactions || []).map((tx: { merchant_name: string | null; category_human: string | null; category_ai: string | null }) => ({
        merchant_name: tx.merchant_name || '',
        category_human: tx.category_human || '',
        category_ai: tx.category_ai || '',
      })),
      (existingRules || []).map((r: { match_value: string; gl_code: string }) => ({
        match_value: r.match_value,
        gl_code: r.gl_code,
      }))
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    return handleApiError(error, 'rule-suggestions', 'Failed to generate rule suggestions');
  }
}
