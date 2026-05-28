import { NextRequest, NextResponse } from 'next/server';

// POST /api/contact — Store contact form submission
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, company, type, entityCount, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: 'Name, email, and message are required' },
        { status: 400 }
      );
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (message && message.length > 5000) {
      return NextResponse.json({ error: 'Message too long (max 5000 chars)' }, { status: 400 });
    }
    // Sanitize
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedMessage = message?.trim().slice(0, 5000) || '';

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    const { writeAuditLog } = await import('@/lib/audit');
    // Store in audit_log (or a dedicated contact_submissions table)
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
        type: type || null,
        entity_count: entityCount || null,
        message: sanitizedMessage,
        submitted_at: new Date().toISOString(),
      },
      request,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      { error: 'Failed to submit contact form' },
      { status: 500 }
    );
  }
}
