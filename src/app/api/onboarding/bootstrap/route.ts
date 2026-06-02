import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/onboarding/bootstrap
 * 
 * Creates org + team_member + entity for a new user during onboarding.
 * Uses service_role to bypass RLS bootstrapping restrictions (a new user has
 * no org membership yet, so client-side RLS policies block the initial inserts).
 * 
 * Body: { entityName: string, currency: string, fiscalYearEnd: string }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify the requesting user is authenticated
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { entityName, currency, fiscalYearEnd } = body;

    if (!entityName?.trim()) {
      return NextResponse.json(
        { error: 'Entity name is required.' },
        { status: 400 }
      );
    }

    // 3. Use admin client for service-role operations (bypasses RLS)
    const adminClient = createAdminClient();

    // 4. Check if user already has an org
    const { data: existingMemberships } = await adminClient
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .limit(1);

    const existingMembership = existingMemberships?.[0] ?? null;

    let orgId: string;

    if (existingMembership?.org_id) {
      orgId = existingMembership.org_id;
    } else {
      // 5. Create organization
      const baseSlug = `${entityName} Org`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const uniqueSuffix = Math.random().toString(36).substring(2, 8);
      const slug = `${baseSlug}-${uniqueSuffix}`;

      const { data: newOrg, error: orgError } = await adminClient
        .from('organizations')
        .insert({ name: `${entityName} Org`, slug, owner_id: user.id })
        .select('id')
        .single();

      if (orgError || !newOrg) {
        console.error('[Onboarding API] Org creation failed:', orgError);
        return NextResponse.json(
          { error: 'Failed to create organization.' },
          { status: 500 }
        );
      }
      orgId = newOrg.id;

      // 6. Add user as team member with owner role
      const { error: memberError } = await adminClient
        .from('team_members')
        .insert({
          user_id: user.id,
          org_id: orgId,
          role: 'owner',
        });

      if (memberError) {
        console.error('[Onboarding API] Team member creation failed:', memberError);
        // Rollback org
        await adminClient.from('organizations').delete().eq('id', orgId);
        return NextResponse.json(
          { error: 'Failed to set up team membership.' },
          { status: 500 }
        );
      }
    }

    // 7. Create the entity
    const { data: newEntity, error: entityError } = await adminClient
      .from('entities')
      .insert({
        name: entityName.trim(),
        fiscal_year_end: fiscalYearEnd || '12',
        org_id: orgId,
      })
      .select('id')
      .single();

    if (entityError || !newEntity) {
      console.error('[Onboarding API] Entity creation failed:', entityError);
      return NextResponse.json(
        { error: 'Failed to create entity.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orgId,
      entityId: newEntity.id,
      message: 'Bootstrap complete',
    });

  } catch (err) {
    console.error('[Onboarding API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
