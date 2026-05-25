import { NextRequest, NextResponse } from 'next/server';
import { parseTeamsWebhookPayload, mapTeamsChoiceToGL, sendTeamsConfirmation } from '@/lib/channels/teams';

// POST /api/channels/teams/webhook — Handle Teams adaptive card responses
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = parseTeamsWebhookPayload(body);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    if (parsed.categoryChoice === 'personal') {
      // Mark as personal/excluded
      await (supabase as any)
        .from('transactions')
        .update({
          status: 'approved',
          tags: ['personal', 'excluded'],
          updated_at: new Date().toISOString(),
        })
        .eq('id', parsed.transactionId);

      // Send confirmation
      const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
      if (webhookUrl) {
        await sendTeamsConfirmation(webhookUrl, parsed.transactionId, 'personal');
      }
    } else if (parsed.categoryChoice === 'accept') {
      // Accept AI suggestion
      const { data: tx } = await (supabase as any)
        .from('transactions')
        .select('category_ai')
        .eq('id', parsed.transactionId)
        .single();

      await (supabase as any)
        .from('transactions')
        .update({
          status: 'approved',
          category_human: tx?.category_ai,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parsed.transactionId);

      const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
      if (webhookUrl) {
        await sendTeamsConfirmation(
          webhookUrl,
          parsed.transactionId,
          'accept',
          tx?.category_ai
        );
      }
    } else {
      // Map choice to GL code
      const gl = mapTeamsChoiceToGL(parsed.categoryChoice);
      if (gl) {
        await (supabase as any)
          .from('transactions')
          .update({
            status: 'approved',
            category_human: gl.glCode,
            updated_at: new Date().toISOString(),
          })
          .eq('id', parsed.transactionId);

        const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
        if (webhookUrl) {
          await sendTeamsConfirmation(
            webhookUrl,
            parsed.transactionId,
            'categorize',
            gl.glCode,
            gl.glName
          );
        }
      }
    }

    // Log to audit trail
    const { data: tx } = await (supabase as any)
      .from('transactions')
      .select('entity_id')
      .eq('id', parsed.transactionId)
      .single();

    if (tx) {
      await (supabase as any).from('audit_log').insert({
        entity_id: tx.entity_id,
        action: 'categorize',
        target_type: 'transaction',
        target_id: parsed.transactionId,
        actor_type: 'human',
        details: {
          source: 'teams',
          choice: parsed.categoryChoice,
          action: parsed.action,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Teams webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
