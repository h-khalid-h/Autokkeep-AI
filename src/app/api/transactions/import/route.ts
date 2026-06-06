
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/transactions/import — CSV Transaction Import
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { parseCsvTransactions } from '@/lib/import/csv-parser';
import type { ParsedTransaction } from '@/lib/import/csv-parser';

// ─── Constants ──────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── POST: Import transactions from CSV ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 req/min for imports (heavy operation)
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'txn-import' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Invalid form data. Expected multipart/form-data with a CSV file.' },
        { status: 400 }
      );
    }

    // Extract and validate entityId
    const entityId = formData.get('entityId');
    if (!entityId || typeof entityId !== 'string' || !UUID_RE.test(entityId)) {
      return NextResponse.json(
        { error: 'Missing or invalid entityId. Must be a valid UUID.' },
        { status: 400 }
      );
    }

    // Validate entity access
    const { data: entity } = await db
      .from('entities')
      .select('id, org_id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Extract and validate CSV file
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing CSV file. Upload a file with the field name "file".' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    const isValidType =
      fileName.endsWith('.csv') ||
      file.type === 'text/csv' ||
      file.type === 'text/plain' ||
      file.type === 'application/csv';

    if (!isValidType) {
      return NextResponse.json(
        { error: 'Invalid file type. Only CSV files are accepted.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.` },
        { status: 400 }
      );
    }

    // Read and parse CSV content
    const csvText = await file.text();
    if (!csvText.trim()) {
      return NextResponse.json(
        { error: 'CSV file is empty.' },
        { status: 400 }
      );
    }

    const parseResult = parseCsvTransactions(csvText);

    if (parseResult.transactions.length === 0) {
      return NextResponse.json(
        {
          imported: 0,
          skipped: parseResult.skipped,
          errors: parseResult.errors.length > 0
            ? parseResult.errors
            : ['No valid transactions found in the CSV file.'],
          total: 0,
          detectedFormat: parseResult.detectedFormat,
        },
        { status: 400 }
      );
    }

    // ── Import transactions with duplicate detection ────────────────────────

    let imported = 0;
    let duplicatesSkipped = 0;
    const importErrors: string[] = [...parseResult.errors];

    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() + 7);
    const retentionLockStr = retentionDate.toISOString().split('T')[0];

    for (let i = 0; i < parseResult.transactions.length; i++) {
      const tx: ParsedTransaction = parseResult.transactions[i];

      try {
        // ── Duplicate detection ──────────────────────────────────────────
        // Check for existing transaction with same entity_id + date + amount
        // + merchant within a 1-day window
        const dateObj = new Date(tx.date);
        const dayBefore = new Date(dateObj);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayAfter = new Date(dateObj);
        dayAfter.setDate(dayAfter.getDate() + 1);

        const { data: existing } = await db
          .from('transactions')
          .select('id')
          .eq('entity_id', entityId)
          .eq('amount', tx.amount)
          .gte('date', dayBefore.toISOString().split('T')[0])
          .lte('date', dayAfter.toISOString().split('T')[0])
          .or(`merchant_name.eq.${tx.description},merchant_raw.eq.${tx.description}`)
          .is('deleted_at', null)
          .limit(1);

        if (existing && existing.length > 0) {
          duplicatesSkipped++;
          continue;
        }

        // ── Insert transaction ───────────────────────────────────────────
        const { error: insertError } = await db
          .from('transactions')
          .insert({
            entity_id: entityId,
            merchant_name: tx.description,
            merchant_raw: tx.description,
            amount: tx.amount,
            date: tx.date,
            currency: tx.currency || 'USD',
            description: tx.reference || `CSV import: ${tx.description}`,
            status: TRANSACTION_STATUS.PENDING,
            confidence: 0,
            created_by: user.id,
            retention_lock_until: retentionLockStr,
          });

        if (insertError) {
          importErrors.push(`Row ${i + 2}: Insert failed — ${insertError.message}`);
          continue;
        }

        imported++;
      } catch (err) {
        importErrors.push(`Row ${i + 2}: Unexpected error — ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    // ── Audit log ───────────────────────────────────────────────────────────
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'create',
      targetType: 'csv_import',
      details: {
        source: 'csv_import',
        file_name: file.name,
        imported,
        duplicates_skipped: duplicatesSkipped,
        parse_skipped: parseResult.skipped,
        errors_count: importErrors.length,
        total_parsed: parseResult.transactions.length,
        detected_format: parseResult.detectedFormat,
      },
      request,
    });

    return NextResponse.json({
      imported,
      skipped: duplicatesSkipped + parseResult.skipped,
      errors: importErrors.slice(0, 50), // Cap error list to prevent huge responses
      total: parseResult.transactions.length,
      detectedFormat: parseResult.detectedFormat,
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/transactions/import', 'Failed to import transactions');
  }
}
