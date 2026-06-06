
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/cron/ocr-process — Async OCR Receipt Processing Pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { handleApiError } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractReceiptData } from '@/lib/ocr/extractor';
import { matchReceiptToTransaction } from '@/lib/ocr/matcher';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { verifyCronAuth } from '@/lib/cron-auth';

// ─── Types ─────────────────────────────────────────────────────────────────────

const MAX_RETRY_COUNT = 3;

interface OcrQueueItem {
  id: string;
  entity_id: string;
  transaction_id: string | null;
  file_url: string;
  retry_count: number;
}

interface ProcessingResult {
  id: string;
  status: 'matched' | 'completed' | 'failed' | 'skipped';
  transactionId?: string;
  confidence?: number;
  error?: string;
  skipped?: boolean;
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Verify cron secret ──────────────────────────────────────────────
    const cronError = verifyCronAuth(request);
    if (cronError) return cronError;

    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'cron-ocr-process' });
    if (limited) return limited;

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // ── Fetch pending OCR queue items ───────────────────────────────────
    const { data: pendingItems, error: pendingError } = await db
      .from('receipt_ocr_queue')
      .select('id, entity_id, transaction_id, file_url, retry_count')
      .eq('status', 'pending')
      .limit(10);

    // ── Fetch failed items eligible for retry ───────────────────────────
    const { data: retryItems, error: retryError } = await db
      .from('receipt_ocr_queue')
      .select('id, entity_id, transaction_id, file_url, retry_count')
      .eq('status', 'failed')
      .lt('retry_count', MAX_RETRY_COUNT)
      .limit(5);

    const queueError = pendingError || retryError;
    const queueItems = [
      ...(pendingItems ?? []),
      ...(retryItems ?? []),
    ];

    if (queueError) {
      console.error('[Cron OCR] Failed to fetch queue:', queueError);
      return NextResponse.json(
        { error: 'Failed to fetch OCR queue' },
        { status: 500 }
      );
    }

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'No pending OCR items',
      });
    }

    // ── Process queue items in batches ────────────────────────────────
    const CONCURRENCY_LIMIT = 3;
    const results: ProcessingResult[] = [];

    for (let i = 0; i < (queueItems as OcrQueueItem[]).length; i += CONCURRENCY_LIMIT) {
      const batch = (queueItems as OcrQueueItem[]).slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          try {
            // Mark item as processing — optimistic lock prevents double-processing
            const { data: claimed } = await db
              .from('receipt_ocr_queue')
              .update({ status: 'processing' })
              .eq('id', item.id)
              .in('status', ['pending', 'failed']) // Only claim if not already processing
              .select('id');

            if (!claimed || claimed.length === 0) {
              // Another cron instance already claimed this item
              return { id: item.id, status: 'skipped' as const, skipped: true };
            }

            // Step 0: Fetch entity's base currency for correct OCR defaults
            const { data: entityData } = await db
              .from('entities')
              .select('base_currency')
              .eq('id', item.entity_id)
              .single();
            const entityBaseCurrency = (entityData?.base_currency as string) || undefined;

            // Step 1: Extract receipt data via OCR
            const extractedData = await extractReceiptData(item.file_url, entityBaseCurrency);

            // Step 2: Match to a transaction
            const match = await matchReceiptToTransaction(
              db,
              item.entity_id,
              extractedData
            );

            if (match) {
              // ── Matched: update transaction and OCR queue ────────────────

              // Build transaction update — propagate businessPurpose to
              // description for tax authority substantiation compliance
              const txUpdate: Record<string, unknown> = {
                document_status: 'found',
                updated_at: new Date().toISOString(),
              };

              const purpose = (extractedData as unknown as Record<string, unknown>)?.businessPurpose;
              if (purpose && typeof purpose === 'string') {
                // Fetch current description to append rather than overwrite
                const { data: currentTx } = await db
                  .from('transactions')
                  .select('description')
                  .eq('id', match.transactionId)
                  .single();

                const existing = (currentTx?.description as string) ?? '';
                if (!existing.includes(purpose)) {
                  txUpdate.description = existing
                    ? `${existing} | Business Purpose: ${purpose}`
                    : `Business Purpose: ${purpose}`;
                }
              }

              await db
                .from('transactions')
                .update(txUpdate)
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

              return {
                id: item.id,
                status: 'matched' as const,
                transactionId: match.transactionId,
                confidence: match.confidence,
              };
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

              return {
                id: item.id,
                status: 'completed' as const,
              };
            }
          } catch (err: unknown) {
            // ── Error: retry or permanently fail ─────────────────────────────
            const errorMessage = err instanceof Error ? err.message : 'Unknown OCR error';
            const nextRetryCount = (item.retry_count ?? 0) + 1;
            const isPermanentFailure = nextRetryCount >= MAX_RETRY_COUNT;

            console.error(
              `[Cron OCR] Failed to process item ${item.id} (attempt ${nextRetryCount}/${MAX_RETRY_COUNT}):`,
              err
            );

            if (isPermanentFailure) {
              // Max retries exhausted — mark as permanently failed
              await db
                .from('receipt_ocr_queue')
                .update({
                  status: 'failed',
                  retry_count: nextRetryCount,
                  error_message: errorMessage,
                  processed_at: new Date().toISOString(),
                })
                .eq('id', item.id);

              // Notify user via transaction document_status so dashboard can display an alert
              if (item.transaction_id) {
                await db
                  .from('transactions')
                  .update({
                    document_status: 'ocr_failed',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', item.transaction_id)
                  .eq('entity_id', item.entity_id);
              }
            } else {
              // Re-queue for retry with incremented retry_count
              await db
                .from('receipt_ocr_queue')
                .update({
                  status: 'pending',
                  retry_count: nextRetryCount,
                  error_message: errorMessage,
                })
                .eq('id', item.id);
            }

            return {
              id: item.id,
              status: 'failed' as const,
              error: errorMessage,
            };
          }
        })
      );

      // Collect results from this batch
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }
    }

    // ── Aggregate results ───────────────────────────────────────────────
    const matched = results.filter((r) => r.status === 'matched').length;
    const completed = results.filter((r) => r.status === 'completed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

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
        skipped,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      processed: results.length,
      matched,
      completed,
      failed,
      skipped,
      results,
    });
  } catch (error) {
    return handleApiError(error, 'cron/ocr-process', 'OCR processing cron failed');
  }
}
