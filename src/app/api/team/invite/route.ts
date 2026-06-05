import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';
import { Resend } from 'resend';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody, schemas } from '@/lib/validation';

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'Autokkeep <noreply@autokkeep.com>';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 invites per minute
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'team-invite' });
    if (limited) return limited;

    // Auth check — only org admins/owners can invite
    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { membership, db, user } = ctx;

    const parsed = await parseBody(request, schemas.inviteTeamMember);
    if (!parsed.success) return parsed.error;
    const { email, role } = parsed.data;

    // Normalize
    const normalizedEmail = email.toLowerCase().trim();

    // Server-side seat limit enforcement
    const { count: memberCount } = await db
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', membership.org_id);

    const { data: sub } = await db
      .from('subscriptions')
      .select('plan')
      .eq('org_id', membership.org_id)
      .eq('status', 'active')
      .maybeSingle();

    // Plan keys match DB values set by Stripe webhook via PLAN_DB_NAMES
    const PLAN_SEAT_LIMITS: Record<string, number> = {
      free: 3,
      starter: 3,
      smb_growth: 10,
      cpa_professional: Infinity,
      cpa_enterprise: Infinity,
    };
    const limit = PLAN_SEAT_LIMITS[sub?.plan || ''] ?? 3;
    if ((memberCount ?? 0) >= limit) {
      return NextResponse.json(
        { error: `Seat limit reached (${memberCount}/${limit}). Upgrade your plan to add more members.` },
        { status: 403 }
      );
    }

    // Check if user is already a member or already invited
    const { data: existingMember } = await db
      .from('team_members')
      .select('id, user_id, invited_email')
      .eq('org_id', membership.org_id)
      .or(`invited_email.eq.${normalizedEmail}`)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { error: 'This user is already a member or has a pending invite.' },
        { status: 409 }
      );
    }

    // Create a pending team_members record so the invite check in onboarding can link them
    const { error: insertError } = await db
      .from('team_members')
      .insert({
        org_id: membership.org_id,
        invited_email: normalizedEmail,
        role: role || 'viewer',
        // user_id is NULL — will be set when the invited user accepts
      });

    if (insertError) {
      console.error('[Team Invite] Failed to create pending member:', insertError);
      return NextResponse.json(
        { error: 'Failed to create invite record.' },
        { status: 500 }
      );
    }

    // Create a team_invites record to track the invite lifecycle
    const { error: inviteInsertError } = await db
      .from('team_invites')
      .insert({
        org_id: membership.org_id,
        email: normalizedEmail,
        role: role || 'viewer',
        invited_by: user.id,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

    if (inviteInsertError) {
      // Non-fatal: the team_members record was created, so the invite can still work
      console.error('[Team Invite] Failed to create team_invites record:', inviteInsertError);
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Gracefully skip email if Resend is not configured — record was still created
      console.warn('[Team Invite] RESEND_API_KEY not configured, skipping email');
      return NextResponse.json({ success: true, skipped: true });
    }

    const resend = new Resend(apiKey);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com';

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: normalizedEmail,
      subject: `You've been invited to Autokkeep`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
          <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 24px 32px; color: white;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600;">👋 You're Invited!</h1>
            </div>
            <div style="padding: 24px 32px;">
              <p style="font-size: 15px; color: #374151; line-height: 1.6;">
                You've been invited to join an organization on <strong>Autokkeep</strong> as a <strong>${role || 'team member'}</strong>.
              </p>
              <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
                Autokkeep is an AI-powered financial operations platform that automatically categorizes transactions, monitors financial health, and keeps your books close-ready.
              </p>
              <div style="margin-top: 24px; text-align: center;">
                <a href="${appUrl}/auth/signup"
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
                  Accept Invitation →
                </a>
              </div>
            </div>
            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                Autokkeep — AI Financial Operations Platform
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('[Team Invite] Email send failed:', error);
      // Don't delete the team_members record — they can still sign up and be linked
      return NextResponse.json({ success: true, emailFailed: true });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, 'team-invite', 'Failed to send invite email');
  }
}
