
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/transactions/[id]/receipt — Receipt Image Upload
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Accepts an image upload (receipt/invoice) for a specific transaction.
// Stores the image URL and updates document_status on the transaction.
// Also updates any pending receipt_requests for this transaction.

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'receipt-upload' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership: _membership, db, entityIds } = ctx;

    const { id: transactionId } = await params;
    if (entityIds.length === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const { data: transaction } = await db
      .from('transactions')
      .select('id, entity_id, document_status')
      .eq('id', transactionId)
      .in('entity_id', entityIds)
      .single();

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('receipt') as File | null;

    if (!file) {
      // Check for URL-based upload (from messaging channel callbacks)
      const body = Object.fromEntries(formData.entries());
      const receiptUrl = body.receipt_url as string;

      if (receiptUrl && typeof receiptUrl === 'string') {
        // Validate URL: must be https and a well-formed URL
        try {
          const parsed = new URL(receiptUrl);
          if (parsed.protocol !== 'https:') {
            return NextResponse.json(
              { error: 'receipt_url must use https://' },
              { status: 400 }
            );
          }
          // F26: Block internal/private hostnames to prevent SSRF
          const BLOCKED_HOSTS = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|127\.|0\.|localhost|metadata\.|internal\.)/i;
          if (BLOCKED_HOSTS.test(parsed.hostname)) {
            return NextResponse.json(
              { error: 'Internal URLs are not allowed' },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: 'receipt_url is not a valid URL' },
            { status: 400 }
          );
        }

        // Direct URL attachment (e.g., from WhatsApp media URL)
        await db
          .from('transactions')
          .update({
            document_url: receiptUrl,
            document_status: 'found',
            updated_at: new Date().toISOString(),
          })
          .eq('id', transactionId);

        // Update any pending receipt requests
        await db
          .from('receipt_requests')
          .update({
            status: 'responded',
            receipt_url: receiptUrl,
            responded_at: new Date().toISOString(),
          })
          .eq('transaction_id', transactionId)
          .eq('status', 'sent');

        // Audit log
        await writeAuditLog({
          supabase: db,
          entityId: transaction.entity_id,
          actorId: user.id,
          actorType: 'human',
          action: 'update',
          targetType: 'transaction',
          targetId: transactionId,
          details: {
            action: 'receipt_attached',
            source: 'url',
            url: receiptUrl,
          },
          request,
        });

        // ── Enqueue for async OCR processing ────────────────────────
        try {
          const adminDb = createAdminClient() as unknown as SupabaseQueryClient;
          await adminDb.from('receipt_ocr_queue').insert({
            entity_id: transaction.entity_id,
            transaction_id: transactionId,
            file_url: receiptUrl,
            status: 'pending',
          });
        } catch (ocrErr) {
          // Non-blocking: OCR queue failure shouldn't break upload
          console.error('[Receipt Upload] OCR queue insert failed:', ocrErr);
        }

        return NextResponse.json({
          success: true,
          document_url: receiptUrl,
          document_status: 'found',
        });
      }

      return NextResponse.json(
        { error: 'No receipt file or URL provided. Send as multipart form "receipt" field or "receipt_url" text field.' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage
    // Derive extension from MIME type, not user-supplied filename
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'application/pdf': 'pdf',
    };
    const fileExt = mimeToExt[file.type] || 'bin';
    const fileName = `receipts/${transaction.entity_id}/${transactionId}/${Date.now()}.${fileExt}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { data: uploadData, error: uploadError } = await db
      .storage.from('documents')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('[Receipt Upload] Storage error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Get the public URL
    const { data: urlData } = db
      .storage.from('documents')
      .getPublicUrl(uploadData.path);

    const documentUrl = urlData?.publicUrl || fileName;

    // Update transaction
    await db
      .from('transactions')
      .update({
        document_url: documentUrl,
        document_status: 'found',
        updated_at: new Date().toISOString(),
      })
      .eq('id', transactionId);

    // Update receipt requests
    await db
      .from('receipt_requests')
      .update({
        status: 'responded',
        receipt_url: documentUrl,
        responded_at: new Date().toISOString(),
      })
      .eq('transaction_id', transactionId)
      .eq('status', 'sent');

    // Audit log
    await writeAuditLog({
      supabase: db,
      entityId: transaction.entity_id,
      actorId: user.id,
      actorType: 'human',
      action: 'update',
      targetType: 'transaction',
      targetId: transactionId,
      details: {
        action: 'receipt_upload',
        source: 'file',
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: uploadData.path,
      },
      request,
    });

    // ── Enqueue for async OCR processing ──────────────────────────────
    try {
      const adminDb = createAdminClient() as unknown as SupabaseQueryClient;
      await adminDb.from('receipt_ocr_queue').insert({
        entity_id: transaction.entity_id,
        transaction_id: transactionId,
        file_url: documentUrl,
        status: 'pending',
      });
    } catch (ocrErr) {
      // Non-blocking: OCR queue failure shouldn't break upload
      console.error('[Receipt Upload] OCR queue insert failed:', ocrErr);
    }

    return NextResponse.json({
      success: true,
      document_url: documentUrl,
      document_status: 'found',
      file_name: file.name,
      file_size: file.size,
    });
  } catch (error) {
    console.error('[Receipt Upload] Error:', error);
    return NextResponse.json(
      { error: 'Receipt upload failed' },
      { status: 500 }
    );
  }
}
