
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/cron/ocr-process — Async OCR Receipt Processing Pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { captureException } from '@/lib/sentry';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractReceiptData } from '@/lib/ocr/extractor';
import { matchReceiptToTransaction } from '@/lib/ocr/matcher';
import { writeAuditLog } from '@/lib/audit';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OcrQueueItem {
  id: string;
  entity_id: string;
  transaction_id: string | null;
  file_url: string;
}

interface ProcessingResult {
  id: string;
  status: 'matched' | 'completed' | 'failed';
  transactionId?: string;
  confidence?: number;
  error?: string;
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Verify cron secret ──────────────────────────────────────────────
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // ── Fetch pending OCR queue items ───────────────────────────────────
    const { data: queueItems, error: queueError } = await db
      .from('receipt_ocr_queue')
      .select('id, entity_id, transaction_id, file_url')
      .eq('status', 'pending')
      .limit(10);

    if (queueError) {
      console.error('[Cron OCR] Failed to fetch queue:', queueError);
      return NextResponse.json(
        { error: 'Failed to fetch OCR queue' },
        { status: 500 }
      );
    }

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: 'No pending OCR items',
      });
    }

    // ── Process each queue item ─────────────────────────────────────────
    const results: ProcessingResult[] = [];

    for (const item of queueItems as OcrQueueItem[]) {
      try {
        // Step 1: Extract receipt data via OCR
        const extractedData = await extractReceiptData(item.file_url);

        // Step 2: Match to a transaction
        const match = await matchReceiptToTransaction(
          db,
          item.entity_id,
          extractedData
        );

        if (match) {
          // ── Matched: update transaction and OCR queue ────────────────
          await db
            .from('transactions')
            .update({
              document_status: 'found',
              updated_at: new Date().toISOString(),
            })
            .eq('id', match.transactionId);

          await db
            .from('receipt_ocr_queue')
            .update({
              status: 'matched',
              matched_transaction_id: match.transactionId,
              confidence: match.confidence,
              extracted_data: extractedData,
              processed_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          results.push({
            id: item.id,
            status: 'matched',
            transactionId: match.transactionId,
            confidence: match.confidence,
          });
        } else {
          // ── Extracted but unmatched ──────────────────────────────────
          await db
            .from('receipt_ocr_queue')
            .update({
              status: 'completed',
              extracted_data: extractedData,
              processed_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          results.push({
            id: item.id,
            status: 'completed',
          });
        }
      } catch (err: unknown) {
        // ── Error: mark as failed ───────────────────────────────────────
        const errorMessage = err instanceof Error ? err.message : 'Unknown OCR error';
        console.error(`[Cron OCR] Failed to process item ${item.id}:`, err);

        await db
          .from('receipt_ocr_queue')
          .update({
            status: 'failed',
            error_message: errorMessage,
            processed_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        results.push({
          id: item.id,
          status: 'failed',
          error: errorMessage,
        });
      }
    }

    // ── Aggregate results ───────────────────────────────────────────────
    const matched = results.filter((r) => r.status === 'matched').length;
    const completed = results.filter((r) => r.status === 'completed').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    // ── Audit log ───────────────────────────────────────────────────────
    await writeAuditLog({
      supabase: db,
      entityId: undefined,
      actorId: 'system',
      actorType: 'system',
      action: 'sync',
      targetType: 'ocr_process_cron',
      details: {
        total_processed: results.length,
        matched,
        completed,
        failed,
      },
      request,
    });

    return NextResponse.json({
      ok: true,
      processed: results.length,
      matched,
      completed,
      failed,
      results,
    });
  } catch (error) {
    captureException(error, { tags: { route: 'cron/ocr-process' } });
    console.error('[Cron OCR] Error:', error);
    return NextResponse.json(
      { error: 'OCR processing cron failed' },
      { status: 500 }
    );
  }
}
