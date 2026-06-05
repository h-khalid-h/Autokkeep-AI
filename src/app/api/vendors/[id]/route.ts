
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/PATCH/DELETE /api/vendors/[id] — Vendor Detail Operations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { parseBody, schemas } from '@/lib/validation';
import {
  IRS_1099_THRESHOLD,
  W9_EXPIRATION_YEARS,
} from '@/lib/vendors/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─── GET: Vendor details + compliance status ────────────────────────────────────

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'vendor-get' });
    if (limited) return limited;

    const { id } = await context.params;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { db, entityIds } = ctx;

    if (entityIds.length === 0) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      );
    }

    // Fetch vendor scoped to user's entities
    const { data: vendor, error: fetchError } = await db
      .from('vendors')
      .select('id, entity_id, name, normalized_name, vendor_type, w9_status, w9_received_at, is_1099_eligible, ytd_payments, ytd_payment_count, last_payment_date, email, phone, address, notes, is_active, created_at, updated_at')
      .eq('id', id)
      .in('entity_id', entityIds)
      .single();

    if (fetchError || !vendor) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      );
    }

    // Compute compliance status
    const w9Expired = vendor.w9_received_at
      ? new Date(vendor.w9_received_at).getTime() <
        Date.now() - W9_EXPIRATION_YEARS * 365.25 * 24 * 60 * 60 * 1000
      : false;

    const complianceStatus = {
      w9Status: w9Expired ? 'expired' : vendor.w9_status,
      is1099Eligible: vendor.is_1099_eligible,
      ytdPayments: vendor.ytd_payments,
      exceeds1099Threshold: vendor.ytd_payments >= IRS_1099_THRESHOLD,
      needs1099Filing:
        vendor.is_1099_eligible && vendor.ytd_payments >= IRS_1099_THRESHOLD,
      needsW9Collection:
        vendor.is_1099_eligible &&
        vendor.ytd_payments >= IRS_1099_THRESHOLD &&
        (vendor.w9_status === 'not_collected' || vendor.w9_status === 'requested' || w9Expired),
      w9Expired,
    };

    return NextResponse.json({ vendor, complianceStatus });
  } catch (error) {
    return handleApiError(error, 'vendors-id-get', 'Failed to fetch vendor');
  }
}

// ─── PATCH: Update vendor ───────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'vendor-update' });
    if (limited) return limited;

    const { id } = await context.params;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    if (entityIds.length === 0) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      );
    }

    // Fetch existing vendor scoped to user's entities
    const { data: existing, error: fetchError } = await db
      .from('vendors')
      .select('id, entity_id, name, normalized_name, vendor_type, w9_status, w9_received_at, is_1099_eligible, ytd_payments, email, phone, address, notes, is_active, created_at, updated_at')
      .eq('id', id)
      .in('entity_id', entityIds)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, schemas.updateVendor);
    if (!parsed.success) return parsed.error;
    const { vendorType, w9Status, email, phone, address, notes, isActive } = parsed.data;

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (vendorType !== undefined) updateData.vendor_type = vendorType;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (notes !== undefined) updateData.notes = notes;
    if (isActive !== undefined) updateData.is_active = isActive;

    // Handle W-9 status with auto-timestamp
    if (w9Status !== undefined) {
      updateData.w9_status = w9Status;
      if (w9Status === 'received' || w9Status === 'verified') {
        updateData.w9_received_at = new Date().toISOString();
      }
    }

    const { data: vendor, error: updateError } = await db
      .from('vendors')
      .update(updateData)
      .eq('id', id)
      .select('id, entity_id, name, normalized_name, vendor_type, w9_status, w9_received_at, is_1099_eligible, ytd_payments, ytd_payment_count, last_payment_date, email, phone, address, notes, is_active, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('[Vendor Update] Error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update vendor' },
        { status: 500 }
      );
    }

    // Audit log
    await writeAuditLog({
      supabase: db,
      entityId: existing.entity_id,
      actorId: user.id,
      actorType: 'human',
      action: 'update',
      targetType: 'vendor',
      targetId: id,
      details: {
        changes: parsed.data,
        previousW9Status: existing.w9_status,
      },
      request,
    });

    return NextResponse.json({ vendor });
  } catch (error) {
    return handleApiError(error, 'vendors-id-patch', 'Failed to update vendor');
  }
}

// ─── DELETE: Soft-delete vendor ─────────────────────────────────────────────────

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'vendor-delete' });
    if (limited) return limited;

    const { id } = await context.params;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    if (entityIds.length === 0) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      );
    }

    // Fetch existing vendor scoped to user's entities
    const { data: existing, error: fetchError } = await db
      .from('vendors')
      .select('id, entity_id, name, vendor_type, is_active')
      .eq('id', id)
      .in('entity_id', entityIds)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      );
    }

    // Soft delete
    const { error: deleteError } = await db
      .from('vendors')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (deleteError) {
      console.error('[Vendor Delete] Error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete vendor' },
        { status: 500 }
      );
    }

    // Audit log
    await writeAuditLog({
      supabase: db,
      entityId: existing.entity_id,
      actorId: user.id,
      actorType: 'human',
      action: 'delete',
      targetType: 'vendor',
      targetId: id,
      details: {
        name: existing.name,
        vendorType: existing.vendor_type,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'vendors-id-delete', 'Failed to delete vendor');
  }
}
