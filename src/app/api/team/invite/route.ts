import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'Autokkeep <noreply@autokkeep.com>';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 invites per minute
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'team-invite' });
    if (limited) return limited;

    // Auth check — only org admins/owners can invite
    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { email, role } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    // Normalize
    const normalizedEmail = email.toLowerCase().trim();

    // Validate role
    const validRoles = ['owner', 'admin', 'accountant', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

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
      .single();

    const PLAN_SEAT_LIMITS: Record<string, number> = {
      starter_monthly: 3, starter_yearly: 3,
      growth_monthly: 10, growth_yearly: 10,
      pro_monthly: Infinity, pro_yearly: Infinity,
    };
    const limit = PLAN_SEAT_LIMITS[sub?.plan || ''] ?? 3;
    if ((memberCount ?? 0) >= limit) {
      return NextResponse.json(
        { error: `Seat limit reached (${memberCount}/${limit}). Upgrade your plan to add more members.` },
        { status: 403 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Gracefully skip if Resend is not configured
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
                <a href="${appUrl}/auth/login"
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
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Team Invite] Error:', err);
    return NextResponse.json(
      { error: 'Failed to send invite email' },
      { status: 500 }
    );
  }
}
