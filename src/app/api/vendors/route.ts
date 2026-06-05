
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/vendors — List & Create Vendors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { parseBody, schemas } from '@/lib/validation';
import { normalizeMerchantName } from '@/lib/vendors/service';

// ─── GET: List vendors with filtering ───────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'vendor-list' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { db, entityIds } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const search = searchParams.get('search');
    const w9Status = searchParams.get('w9Status');
    const is1099Eligible = searchParams.get('is1099Eligible');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

    // entityId is required
    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    // Validate entity access
    if (!entityIds.includes(entityId)) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Build query
    let query = db
      .from('vendors')
      .select('id, entity_id, name, normalized_name, vendor_type, w9_status, w9_received_at, is_1099_eligible, ytd_payments, ytd_payment_count, last_payment_date, email, phone, address, notes, is_active, created_at, updated_at', { count: 'exact' })
      .eq('entity_id', entityId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    // Filter by W-9 status
    if (w9Status) {
      query = query.eq('w9_status', w9Status);
    }

    // Filter by 1099 eligibility
    if (is1099Eligible !== null && is1099Eligible !== undefined && is1099Eligible !== '') {
      query = query.eq('is_1099_eligible', is1099Eligible === 'true');
    }

    // Search by vendor name
    if (search) {
      const sanitized = search
        .replace(/[\\%_]/g, (c) => `\\${c}`)
        .replace(/[,.()]/g, '')
        .slice(0, 100);

      if (sanitized.length > 0) {
        query = query.or(
          `name.ilike.%${sanitized}%,normalized_name.ilike.%${sanitized}%`
        );
      }
    }

    const { data: vendors, error: queryError, count } = await query;

    if (queryError) {
      console.error('[Vendors] Query error:', queryError);
      return NextResponse.json(
        { error: 'Failed to fetch vendors' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      vendors: vendors || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    return handleApiError(error, 'vendors-get', 'Failed to fetch vendors');
  }
}

// ─── POST: Create vendor ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'vendor-create' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    const result = await parseBody(request, schemas.createVendor);
    if (!result.success) return result.error;
    const { entityId, name, vendorType, email, phone, address } = result.data;

    // Validate entity access
    if (!entityIds.includes(entityId)) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Normalize name for deduplication
    const normalizedName = normalizeMerchantName(name);

    // Check for existing vendor with same normalized name
    const { data: existing } = await db
      .from('vendors')
      .select('id, name')
      .eq('entity_id', entityId)
      .eq('normalized_name', normalizedName)
      .eq('is_active', true)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `A vendor with a similar name already exists: "${existing[0].name}"` },
        { status: 409 }
      );
    }

    // Create vendor
    const { data: vendor, error: createError } = await db
      .from('vendors')
      .insert({
        entity_id: entityId,
        name,
        normalized_name: normalizedName,
        vendor_type: vendorType || 'unknown',
        w9_status: 'not_collected',
        email: email || null,
        phone: phone || null,
        address: address || null,
      })
      .select('id, entity_id, name, normalized_name, vendor_type, w9_status, w9_received_at, is_1099_eligible, ytd_payments, ytd_payment_count, last_payment_date, email, phone, address, notes, is_active, created_at, updated_at')
      .single();

    if (createError) {
      console.error('[Vendors] Create error:', createError);
      return NextResponse.json(
        { error: 'Failed to create vendor' },
        { status: 500 }
      );
    }

    // Audit log
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'create',
      targetType: 'vendor',
      targetId: vendor.id,
      details: { name, normalizedName, vendorType: vendorType || 'unknown' },
      request,
    });

    return NextResponse.json({ vendor }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'vendors-post', 'Failed to create vendor');
  }
}
