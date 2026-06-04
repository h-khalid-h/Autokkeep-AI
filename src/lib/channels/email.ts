// ============================================
// EMAIL CHANNEL ADAPTER (Resend)
// Receipt request emails via Resend
// ============================================

import { Resend } from 'resend';
import { formatCurrency } from '@/lib/currency/converter';

// ============================================
// RESEND CLIENT
// ============================================

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'Autokkeep <noreply@autokkeep.com>';

// ============================================
// Types
// ============================================

export interface ReceiptRequestContext {
  merchantName: string;
  amount: number;
  date: string;
  cardLast4: string;
  cardHolder: string;
  transactionId: string;
  currency?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================
// HTML Sanitization
// ============================================

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================
// HTML Template Builder
// ============================================

function buildReceiptRequestHtml(context: ReceiptRequestContext): string {
  const formattedAmount = formatCurrency(context.amount, context.currency || 'USD');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com';
  const uploadUrl = `${appUrl}/transactions/${context.transactionId}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 20px 24px; color: white;">
          <h1 style="margin: 0; font-size: 18px; font-weight: 600;">💳 Receipt Needed</h1>
          <p style="margin: 4px 0 0; opacity: 0.8; font-size: 13px;">Autokkeep detected a transaction requiring documentation</p>
        </div>

        <div style="padding: 24px;">
          <!-- Transaction Details -->
          <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; width: 100px;">Merchant</td>
                <td style="padding: 6px 0; font-weight: 600; color: #1e293b;">${escapeHtml(context.merchantName)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280;">Amount</td>
                <td style="padding: 6px 0; font-weight: 600; color: #1e293b;">${formattedAmount}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280;">Date</td>
                <td style="padding: 6px 0; color: #1e293b;">${escapeHtml(context.date)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280;">Card</td>
                <td style="padding: 6px 0; color: #1e293b;">····${escapeHtml(context.cardLast4)}</td>
              </tr>
            </table>
          </div>

          <!-- Instructions -->
          <p style="font-size: 14px; color: #374151; line-height: 1.6; margin: 0 0 20px;">
            Hi ${escapeHtml(context.cardHolder)}, please upload the receipt for this transaction.
            You can reply to this email with the receipt attached, or use the button below.
          </p>

          <!-- CTA -->
          <div style="text-align: center; margin-bottom: 8px;">
            <a href="${uploadUrl}"
               style="display: inline-block; background: #2563eb; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
              📎 Upload Receipt
            </a>
          </div>

          <!-- Reference -->
          <p style="font-size: 11px; color: #9ca3af; text-align: center; margin: 16px 0 0;">
            Ref: ${context.transactionId}
          </p>
        </div>

        <!-- Footer -->
        <div style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #9ca3af;">
            Autokkeep — AI Financial Operations Platform
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ============================================
// Send Receipt Request via Email
// ============================================

/**
 * Sends a receipt request email via Resend.
 * Builds a rich HTML email with transaction details and upload instructions.
 *
 * @param to - Recipient email address
 * @param context - Transaction context for the receipt request
 * @returns Result with success flag and optional messageId or error
 */
export async function sendEmailReceiptRequest(
  to: string,
  context: ReceiptRequestContext
): Promise<EmailSendResult> {
  try {
    const resend = getResendClient();
    const html = buildReceiptRequestHtml(context);
    const formattedAmount = formatCurrency(context.amount, context.currency || 'USD');

    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `💳 Receipt Needed: ${context.merchantName} — ${formattedAmount}`,
      html,
    });

    if (error) {
      console.error('[Email Channel] Send failed:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error';
    console.error('[Email Channel] Error:', message);
    return { success: false, error: message };
  }
}

/**
 * Sends a raw HTML email via Resend.
 * Used for non-receipt-request emails (close reminders, system notifications, etc.)
 *
 * @param to - Recipient email address
 * @param options - Subject and pre-built HTML content
 * @returns Result with success flag and optional messageId or error
 */
export async function sendRawEmail(
  to: string,
  options: { subject: string; html: string }
): Promise<EmailSendResult> {
  try {
    const resend = getResendClient();

    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      console.error('[Email Channel] Raw send failed:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error';
    console.error('[Email Channel] Raw email error:', message);
    return { success: false, error: message };
  }
}
