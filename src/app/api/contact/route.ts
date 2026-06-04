import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody, schemas } from '@/lib/validation';

// POST /api/contact — Store contact form submission
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'contact' });
    if (limited) return limited;

    const parsed = await parseBody(request, schemas.contactForm);
    if (!parsed.success) return parsed.error;
    const { name, email, message, company } = parsed.data;

    // Normalize
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedMessage = message.trim().slice(0, 5000);

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { writeAuditLog } = await import('@/lib/audit');
    // Store in audit_log (or a dedicated contact_submissions table)
    try {
      await writeAuditLog({
        supabase,
        entityId: 'system',
        actorId: 'anonymous',
        actorType: 'system',
        action: 'create',
        targetType: 'contact_form',
        targetId: sanitizedEmail,
        details: {
          name,
          email: sanitizedEmail,
          company: company || null,
          message: sanitizedMessage,
          submitted_at: new Date().toISOString(),
        },
        request,
      });
    } catch (auditError) {
      console.error('[Contact] Failed to persist contact submission:', auditError);
      return NextResponse.json(
        { error: 'Failed to save contact submission. The audit_log table may not be available. Please try again later or contact support.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Contact form error:', error);
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to submit contact form' },
      { status: 500 }
    );
  }
}
