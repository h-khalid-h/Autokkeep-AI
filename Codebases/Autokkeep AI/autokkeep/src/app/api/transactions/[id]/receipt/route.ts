
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/transactions/[id]/receipt — Receipt Image Upload
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Accepts an image upload (receipt/invoice) for a specific transaction.
// Stores the image URL and updates document_status on the transaction.
// Also updates any pending receipt_requests for this transaction.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { id: transactionId } = await params;

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate transaction access
    const { data: transaction } = await (supabase as any)
      .from('transactions')
      .select('id, entity_id, document_status')
      .eq('id', transactionId)
      .single();

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Verify user has access to this entity
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: entity } = await (supabase as any)
      .from('entities')
      .select('id')
      .eq('id', transaction.entity_id)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('receipt') as File | null;

    if (!file) {
      // Check for URL-based upload (from messaging channel callbacks)
      const body = Object.fromEntries(formData.entries());
      const receiptUrl = body.receipt_url as string;

      if (receiptUrl && typeof receiptUrl === 'string') {
        // Direct URL attachment (e.g., from WhatsApp media URL)
        await (supabase as any)
          .from('transactions')
          .update({
            document_url: receiptUrl,
            document_status: 'found',
            updated_at: new Date().toISOString(),
          })
          .eq('id', transactionId);

        // Update any pending receipt requests
        await (supabase as any)
          .from('receipt_requests')
          .update({
            status: 'responded',
            receipt_url: receiptUrl,
            responded_at: new Date().toISOString(),
          })
          .eq('transaction_id', transactionId)
          .eq('status', 'sent');

        // Audit log
        await (supabase as any).from('audit_log').insert({
          entity_id: transaction.entity_id,
          action: 'update',
          target_type: 'transaction',
          target_id: transactionId,
          actor_id: user.id,
          actor_type: 'human',
          details: {
            action: 'receipt_attached',
            source: 'url',
            url: receiptUrl,
          },
        });

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
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `receipts/${transaction.entity_id}/${transactionId}/${Date.now()}.${fileExt}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { data: uploadData, error: uploadError } = await (supabase as any)
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
    const { data: urlData } = (supabase as any)
      .storage.from('documents')
      .getPublicUrl(uploadData.path);

    const documentUrl = urlData?.publicUrl || fileName;

    // Update transaction
    await (supabase as any)
      .from('transactions')
      .update({
        document_url: documentUrl,
        document_status: 'found',
        updated_at: new Date().toISOString(),
      })
      .eq('id', transactionId);

    // Update receipt requests
    await (supabase as any)
      .from('receipt_requests')
      .update({
        status: 'responded',
        receipt_url: documentUrl,
        responded_at: new Date().toISOString(),
      })
      .eq('transaction_id', transactionId)
      .eq('status', 'sent');

    // Audit log
    await (supabase as any).from('audit_log').insert({
      entity_id: transaction.entity_id,
      action: 'update',
      target_type: 'transaction',
      target_id: transactionId,
      actor_id: user.id,
      actor_type: 'human',
      details: {
        action: 'receipt_uploaded',
        source: 'file',
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: uploadData.path,
      },
    });

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
