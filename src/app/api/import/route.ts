
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/import — CSV Transaction Import
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { parseCSV, importTransactions } from '@/lib/import/csv-importer';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/import
 * Import transactions from a CSV file.
 *
 * Body: FormData with:
 *  - file: CSV file (max 5MB)
 *  - entityId: Target entity ID
 *
 * Returns: ImportResult
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'import' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    // Parse form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Invalid form data. Expected multipart/form-data with a file field.' },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    const entityId = formData.get('entityId');

    // Validate entityId
    if (!entityId || typeof entityId !== 'string') {
      return NextResponse.json({ error: 'Missing "entityId" field' }, { status: 400 });
    }

    // Verify entity access
    if (!entityIds.includes(entityId)) {
      return NextResponse.json({ error: 'Entity not found or access denied' }, { status: 403 });
    }

    // Validate file
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing "file" field. Upload a CSV file.' },
        { status: 400 }
      );
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
        { status: 400 }
      );
    }

    // Check content type (allow text/csv, text/plain, application/csv, etc.)
    const contentType = file.type.toLowerCase();
    const allowedTypes = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel', ''];
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: `Invalid file type: "${file.type}". Upload a CSV file.` },
        { status: 400 }
      );
    }

    // Read file content
    const csvText = await file.text();
    if (!csvText.trim()) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    // Parse CSV
    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'CSV must contain at least a header row and one data row.' },
        { status: 400 }
      );
    }

    // Map header row to data rows as key-value objects
    const headers = rows[0];
    const dataRows = rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = row[i] || '';
      }
      return obj;
    });

    // Run import
    const result = await importTransactions(db, entityId, user.id, dataRows);

    // Log audit event
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'create',
      targetType: 'csv_import',
      details: {
        fileName: file.name,
        fileSize: file.size,
        imported: result.imported,
        skipped: result.skipped,
        errorCount: result.errors.length,
      },
      request,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 207 });
  } catch (error) {
    return handleApiError(error, 'POST /api/import', 'Failed to import CSV');
  }
}
