/**
 * Resend Email Client
 *
 * Configured with the project's Resend API key for transactional emails.
 * Used for weekly digest delivery, high-risk transaction alerts, and
 * account notifications.
 */

import { Resend } from 'resend';
import { formatCurrency } from '@/lib/currency/converter';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';

// ─── HTML Sanitization ──────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Lazy-init singleton
let _resend: Resend | null = null;

function getResendClient(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

// ─── Sender Config ──────────────────────────────────────────────────────────────

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'Autokkeep <noreply@autokkeep.com>';

// ─── Email Types ────────────────────────────────────────────────────────────────

export interface DigestEmailData {
  to: string;
  entityName: string;
  itemCount: number;
  totalValue: number;
  escrowCount: number;
  reviewCount: number;
  currency?: string;
  topItems: Array<{
    merchantName: string;
    amount: number;
    status: string;
  }>;
  digestDate: string;
}

export interface AlertEmailData {
  to: string;
  merchantName: string;
  amount: number;
  confidence: number;
  reasoning: string;
  approveUrl: string;
  rejectUrl: string;
  currency?: string;
}

// ─── Send Functions ─────────────────────────────────────────────────────────────

/**
 * Send the weekly digest email to an entity's admin/accountant.
 */
export async function sendDigestEmail(data: DigestEmailData): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const resend = getResendClient();

    const topItemsHtml = data.topItems
      .map(item => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(item.merchantName)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(Math.abs(item.amount), data.currency || 'USD')}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
            <span style="padding: 2px 8px; border-radius: 12px; font-size: 11px; background: ${item.status === TRANSACTION_STATUS.ESCROW_SUSPENSE ? '#fef3c7' : '#fecaca'}; color: ${item.status === TRANSACTION_STATUS.ESCROW_SUSPENSE ? '#92400e' : '#991b1b'};">
              ${item.status === TRANSACTION_STATUS.ESCROW_SUSPENSE ? 'Escrow' : 'Review'}
            </span>
          </td>
        </tr>
      `)
      .join('');

    const { data: result, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: data.to,
      subject: `📊 Autokkeep Weekly Digest — ${data.entityName} (${data.digestDate})`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 24px 32px; color: white;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600;">📊 Weekly Digest</h1>
              <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">${escapeHtml(data.entityName)} — Week of ${data.digestDate}</p>
            </div>

            <!-- Summary Cards -->
            <div style="padding: 24px 32px;">
              <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                <div style="flex: 1; background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                  <div style="font-size: 28px; font-weight: 700; color: #1e293b;">${data.itemCount}</div>
                  <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Items Pending</div>
                </div>
                <div style="flex: 1; background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                  <div style="font-size: 28px; font-weight: 700; color: #1e293b;">$${data.totalValue.toFixed(0)}</div>
                  <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Total Value</div>
                </div>
              </div>

              <!-- Breakdown -->
              <div style="margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
                  <strong>${data.escrowCount}</strong> in escrow suspense · <strong>${data.reviewCount}</strong> requiring manual review
                </p>
              </div>

              <!-- Top Items -->
              ${data.topItems.length > 0 ? `
              <h3 style="margin: 0 0 12px; font-size: 14px; color: #374151;">Top Items by Amount</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background: #f8fafc;">
                    <th style="padding: 8px 12px; text-align: left; color: #6b7280; font-weight: 500;">Merchant</th>
                    <th style="padding: 8px 12px; text-align: right; color: #6b7280; font-weight: 500;">Amount</th>
                    <th style="padding: 8px 12px; text-align: left; color: #6b7280; font-weight: 500;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${topItemsHtml}
                </tbody>
              </table>
              ` : '<p style="color: #6b7280; font-size: 13px;">No items pending review this week. 🎉</p>'}

              <!-- CTA -->
              <div style="margin-top: 24px; text-align: center;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com'}/transactions" 
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
                  Review Transactions →
                </a>
              </div>
            </div>

            <!-- Footer -->
            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                Autokkeep — AI Financial Operations Platform<br>
                This digest was auto-generated. No action needed if all items look correct.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('[Resend] Digest email failed:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: result?.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Resend] Digest email error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Send a high-risk transaction alert email with approve/reject buttons.
 */
export async function sendAlertEmail(data: AlertEmailData): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const resend = getResendClient();

    const riskLevel = data.confidence < 50 ? 'HIGH' : data.confidence < 80 ? 'MEDIUM' : 'LOW';
    const riskColor = riskLevel === 'HIGH' ? '#dc2626' : riskLevel === 'MEDIUM' ? '#f59e0b' : '#22c55e';

    const { data: result, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: data.to,
      subject: `⚠️ Review Required: ${formatCurrency(Math.abs(data.amount), data.currency || 'USD')} — ${escapeHtml(data.merchantName)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
          <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #7c2d12 0%, #991b1b 100%); padding: 20px 24px; color: white;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">⚠️</span>
                <h1 style="margin: 0; font-size: 18px; font-weight: 600;">Transaction Review Required</h1>
              </div>
            </div>

            <div style="padding: 24px;">
              <!-- Transaction Details -->
              <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <div style="font-size: 24px; font-weight: 700; color: #1e293b;">${formatCurrency(Math.abs(data.amount), data.currency || 'USD')}</div>
                <div style="font-size: 15px; color: #374151; margin-top: 4px;">${escapeHtml(data.merchantName)}</div>
              </div>

              <!-- Risk Badge -->
              <div style="margin-bottom: 16px;">
                <span style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; background: ${riskColor}20; color: ${riskColor};">
                  ${riskLevel} RISK — ${data.confidence}% confidence
                </span>
              </div>

              <!-- Reasoning -->
              <p style="font-size: 13px; color: #6b7280; line-height: 1.5; margin: 0 0 20px;">
                ${data.reasoning}
              </p>

              <!-- Action Buttons -->
              <div style="display: flex; gap: 12px;">
                <a href="${data.approveUrl}" 
                   style="flex: 1; display: block; background: #16a34a; color: white; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px; text-align: center;">
                  ✅ Approve
                </a>
                <a href="${data.rejectUrl}" 
                   style="flex: 1; display: block; background: #dc2626; color: white; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px; text-align: center;">
                  ❌ Reject
                </a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('[Resend] Alert email failed:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: result?.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Resend] Alert email error:', msg);
    return { success: false, error: msg };
  }
}
