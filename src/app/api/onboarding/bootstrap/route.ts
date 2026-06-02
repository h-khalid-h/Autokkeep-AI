import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
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
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { entityName, fiscalYearEnd } = body;

    if (!entityName?.trim()) {
      return NextResponse.json(
        { error: 'Entity name is required.' },
        { status: 400 }
      );
    }

    // 3. Use admin client for service-role operations (bypasses RLS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // 4. Check if user already has an org
    const { data: memberships } = await admin
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .limit(1);

    const existing = (memberships as Array<{ id: string; org_id: string }> | null)?.[0];

    let orgId: string;

    if (existing?.org_id) {
      orgId = existing.org_id;
    } else {
      // 5. Create organization
      const slug = `${entityName}-org`.toLowerCase().replace(/[^a-z0-9-]/g, '') + '-' + Math.random().toString(36).substring(2, 8);

      const { data: newOrg, error: orgError } = await admin
        .from('organizations')
        .insert({ name: `${entityName} Org`, slug, owner_id: user.id })
        .select('id')
        .single();

      if (orgError || !newOrg) {
        console.error('[Onboarding API] Org creation failed:', orgError);
        return NextResponse.json({ error: 'Failed to create organization.' }, { status: 500 });
      }
      orgId = (newOrg as { id: string }).id;

      // 6. Add user as team member with owner role
      const { error: memberError } = await admin
        .from('team_members')
        .insert({ user_id: user.id, org_id: orgId, role: 'owner' });

      if (memberError) {
        console.error('[Onboarding API] Team member creation failed:', memberError);
        await admin.from('organizations').delete().eq('id', orgId);
        return NextResponse.json({ error: 'Failed to set up team membership.' }, { status: 500 });
      }
    }

    // 7. Create the entity
    const { data: newEntity, error: entityError } = await admin
      .from('entities')
      .insert({ name: entityName.trim(), fiscal_year_end: fiscalYearEnd || '12', org_id: orgId })
      .select('id')
      .single();

    if (entityError || !newEntity) {
      console.error('[Onboarding API] Entity creation failed:', entityError);
      return NextResponse.json({ error: 'Failed to create entity.' }, { status: 500 });
    }

    return NextResponse.json({
      orgId,
      entityId: (newEntity as { id: string }).id,
      message: 'Bootstrap complete',
    });

  } catch (err) {
    console.error('[Onboarding API] Unexpected error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
