// POST /api/account/delete — Delete user account and all associated data
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (body.confirmation !== 'DELETE') {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Find user's org memberships
    const { data: memberships } = await (admin as any)
      .from('team_members')
      .select('org_id, role')
      .eq('user_id', user.id);

    if (memberships) {
      for (const membership of memberships) {
        if (membership.role === 'owner') {
          // Check if org has other members
          const { count } = await (admin as any)
            .from('team_members')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', membership.org_id)
            .neq('user_id', user.id);

          if (count === 0) {
            // User is sole owner — delete the entire org (cascades delete everything)
            // Get all entity IDs first for storage cleanup
            const { data: entities } = await (admin as any)
              .from('entities')
              .select('id')
              .eq('org_id', membership.org_id);

            // Clean up storage (receipts)
            if (entities) {
              for (const entity of entities) {
                await (admin as any).storage
                  .from('documents')
                  .remove([`receipts/${entity.id}`]);
              }
            }

            // Delete org — all child tables cascade
            await (admin as any)
              .from('organizations')
              .delete()
              .eq('id', membership.org_id);
          } else {
            // Has other members — just remove this user's membership
            await (admin as any)
              .from('team_members')
              .delete()
              .eq('org_id', membership.org_id)
              .eq('user_id', user.id);
          }
        } else {
          // Not owner — just remove membership
          await (admin as any)
            .from('team_members')
            .delete()
            .eq('org_id', membership.org_id)
            .eq('user_id', user.id);
        }
      }
    }

    // 2. Delete the auth user (requires admin client)
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('[Account Delete] Failed to delete auth user:', deleteError);
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }

    // 3. Log the deletion (user is already gone, log with system actor)
    await (admin as any).from('audit_log').insert({
      action: 'delete',
      target_type: 'user',
      target_id: user.id,
      actor_type: 'system',
      details: {
        action: 'account_deletion',
        email: user.email,
        memberships_removed: memberships?.length || 0,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Account Delete] Error:', error);
    return NextResponse.json({ error: 'Account deletion failed' }, { status: 500 });
  }
}
