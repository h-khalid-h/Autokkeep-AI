import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { parseTeamsWebhookPayload, mapTeamsChoiceToGL, sendTeamsConfirmation } from '@/lib/channels/teams';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';
import { timingSafeEqual } from 'crypto';

// POST /api/channels/teams/webhook — Handle Teams adaptive card responses
export async function POST(request: NextRequest) {
  try {
    // Verify shared secret
    const webhookSecret = process.env.TEAMS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('TEAMS_WEBHOOK_SECRET is not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const providedSecret = request.headers.get('x-teams-secret');
    if (!providedSecret) {
      return NextResponse.json({ error: 'Missing webhook secret' }, { status: 401 });
    }
    try {
      const isValid = timingSafeEqual(
        Buffer.from(providedSecret),
        Buffer.from(webhookSecret)
      );
      if (!isValid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const parsed = parseTeamsWebhookPayload(body);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    if (parsed.categoryChoice === 'personal') {
      // Mark as personal/excluded
      await db
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
      const { data: tx } = await db
        .from('transactions')
        .select('category_ai')
        .eq('id', parsed.transactionId)
        .single();

      await db
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
        await db
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
    const { data: tx } = await db
      .from('transactions')
      .select('entity_id')
      .eq('id', parsed.transactionId)
      .single();

    if (tx) {
      await writeAuditLog({
        supabase: db,
        entityId: tx.entity_id,
        actorType: 'human',
        action: 'categorize',
        targetType: 'transaction',
        targetId: parsed.transactionId,
        details: {
          source: 'teams',
          choice: parsed.categoryChoice,
          action: parsed.action,
        },
        request,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('Teams webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
