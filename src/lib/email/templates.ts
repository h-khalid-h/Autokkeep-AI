/**
 * Enhanced Email Templates
 *
 * Extended template functions for weekly digest enrichment and
 * operational alert emails. Built on top of the Resend client
 * and styling patterns from resend.ts.
 */

import { Resend } from 'resend';
import { formatCurrency } from '@/lib/currency/converter';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';

// ─── HTML Sanitization ──────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Resend Client ──────────────────────────────────────────────────────────────

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

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'Autokkeep <noreply@autokkeep.com>';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface EnhancedDigestData {
  entityName: string;
  digestDate: string;
  // Core stats
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
  // Enhanced: Categorization breakdown
  categorization: {
    autoCount: number;
    manualCount: number;
    averageConfidence: number;
  };
  // Enhanced: Receipt chase status
  receiptChase: {
    chasedCount: number;
    receivedCount: number;
    outstandingCount: number;
  };
  // Enhanced: Health score snapshot
  healthScore: number;
  // Enhanced: Month-end close readiness
  monthEndReadinessPercent: number;
}

interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

// ─── Enhanced Weekly Digest HTML ────────────────────────────────────────────────

/**
 * Builds the enhanced weekly digest HTML with categorization breakdown,
 * receipt chase status, health score, and month-end readiness.
 */
export function buildEnhancedWeeklyDigestHtml(data: EnhancedDigestData): string {
  const currencyCode = data.currency || 'USD';

  const topItemsHtml = data.topItems
    .map(item => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(item.merchantName)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(Math.abs(item.amount), currencyCode)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
          <span style="padding: 2px 8px; border-radius: 12px; font-size: 11px; background: ${item.status === TRANSACTION_STATUS.ESCROW_SUSPENSE ? '#fef3c7' : '#fecaca'}; color: ${item.status === TRANSACTION_STATUS.ESCROW_SUSPENSE ? '#92400e' : '#991b1b'};">
            ${item.status === TRANSACTION_STATUS.ESCROW_SUSPENSE ? 'Escrow' : 'Review'}
          </span>
        </td>
      </tr>
    `)
    .join('');

  // Health score color gradient
  const healthColor = data.healthScore >= 80 ? '#16a34a' : data.healthScore >= 60 ? '#f59e0b' : '#dc2626';

  // Month-end readiness color
  const readinessColor = data.monthEndReadinessPercent >= 90 ? '#16a34a' : data.monthEndReadinessPercent >= 70 ? '#f59e0b' : '#dc2626';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com';

  return `
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
          <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">${escapeHtml(data.entityName)} — Week of ${escapeHtml(data.digestDate)}</p>
        </div>

        <div style="padding: 24px 32px;">
          <!-- Summary Cards Row 1 -->
          <div style="display: flex; gap: 16px; margin-bottom: 16px;">
            <div style="flex: 1; background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #1e293b;">${data.itemCount}</div>
              <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Items Pending</div>
            </div>
            <div style="flex: 1; background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #1e293b;">${formatCurrency(data.totalValue, currencyCode)}</div>
              <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Total Value</div>
            </div>
          </div>

          <!-- Summary Cards Row 2: Health & Readiness -->
          <div style="display: flex; gap: 16px; margin-bottom: 24px;">
            <div style="flex: 1; background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${healthColor};">${data.healthScore}%</div>
              <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Health Score</div>
            </div>
            <div style="flex: 1; background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${readinessColor};">${data.monthEndReadinessPercent}%</div>
              <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Month-End Ready</div>
            </div>
          </div>

          <!-- Breakdown -->
          <div style="margin-bottom: 24px;">
            <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
              <strong>${data.escrowCount}</strong> in escrow suspense · <strong>${data.reviewCount}</strong> requiring manual review
            </p>
          </div>

          <!-- Categorization Breakdown -->
          <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h3 style="margin: 0 0 8px; font-size: 14px; color: #166534;">📂 Categorization Breakdown</h3>
            <p style="margin: 0; font-size: 13px; color: #374151; line-height: 1.6;">
              Auto-categorized: <strong>${data.categorization.autoCount}</strong> ·
              Manual: <strong>${data.categorization.manualCount}</strong><br>
              Average Confidence: <strong>${data.categorization.averageConfidence.toFixed(1)}%</strong>
            </p>
          </div>

          <!-- Receipt Chase Status -->
          <div style="background: #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h3 style="margin: 0 0 8px; font-size: 14px; color: #92400e;">🧾 Receipt Chase Status</h3>
            <p style="margin: 0; font-size: 13px; color: #374151; line-height: 1.6;">
              Chased: <strong>${data.receiptChase.chasedCount}</strong> ·
              Received: <strong>${data.receiptChase.receivedCount}</strong> ·
              Outstanding: <strong>${data.receiptChase.outstandingCount}</strong>
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
            <a href="${appUrl}/transactions"
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
  `;
}

// ─── Alert Email Senders ────────────────────────────────────────────────────────

/**
 * Send an alert when Plaid bank sync fails for an entity.
 */
export async function sendBankSyncFailureAlert(
  orgEmail: string,
  entityName: string,
  error: string
): Promise<EmailResult> {
  try {
    const resend = getResendClient();

    const { data: result, error: sendError } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: orgEmail,
      subject: `🔴 Bank Sync Failed — ${escapeHtml(entityName)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
          <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #7c2d12 0%, #991b1b 100%); padding: 20px 24px; color: white;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 600;">🔴 Bank Sync Failed</h1>
              <p style="margin: 4px 0 0; opacity: 0.8; font-size: 13px;">${escapeHtml(entityName)}</p>
            </div>
            <div style="padding: 24px;">
              <p style="font-size: 14px; color: #374151; line-height: 1.5; margin: 0 0 16px;">
                The automated bank sync (Plaid) failed for <strong>${escapeHtml(entityName)}</strong>.
                This means new transactions are not being pulled in until the issue is resolved.
              </p>
              <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="margin: 0; font-size: 13px; color: #991b1b; font-family: monospace; word-break: break-word;">
                  ${escapeHtml(error)}
                </p>
              </div>
              <p style="font-size: 13px; color: #6b7280; margin: 0 0 20px;">
                This may require re-authenticating the bank connection. Please check the integrations page.
              </p>
              <div style="text-align: center;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com'}/settings/integrations"
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
                  Check Integrations →
                </a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (sendError) {
      console.error('[Resend] Bank sync failure alert failed:', sendError);
      return { success: false, error: sendError.message };
    }

    return { success: true, id: result?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Resend] Bank sync failure alert error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Send an alert when an OAuth token is about to expire (24h warning).
 */
export async function sendTokenExpiringAlert(
  orgEmail: string,
  provider: string,
  entityName: string
): Promise<EmailResult> {
  try {
    const resend = getResendClient();
    const providerDisplay = provider === 'quickbooks' ? 'QuickBooks' : provider === 'xero' ? 'Xero' : provider;

    const { data: result, error: sendError } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: orgEmail,
      subject: `⚠️ ${providerDisplay} Token Expiring — ${escapeHtml(entityName)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
          <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #78350f 0%, #b45309 100%); padding: 20px 24px; color: white;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 600;">⚠️ Token Expiring Soon</h1>
              <p style="margin: 4px 0 0; opacity: 0.8; font-size: 13px;">${escapeHtml(entityName)} — ${escapeHtml(providerDisplay)}</p>
            </div>
            <div style="padding: 24px;">
              <p style="font-size: 14px; color: #374151; line-height: 1.5; margin: 0 0 16px;">
                The <strong>${escapeHtml(providerDisplay)}</strong> connection for
                <strong>${escapeHtml(entityName)}</strong> will expire within <strong>24 hours</strong>.
              </p>
              <p style="font-size: 13px; color: #6b7280; margin: 0 0 20px;">
                Once expired, Autokkeep won't be able to push journal entries to your ledger.
                Please re-authenticate to keep the sync running.
              </p>
              <div style="text-align: center;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com'}/settings/integrations"
                   style="display: inline-block; background: #f59e0b; color: #1e293b; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                  Re-authenticate ${escapeHtml(providerDisplay)} →
                </a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (sendError) {
      console.error('[Resend] Token expiring alert failed:', sendError);
      return { success: false, error: sendError.message };
    }

    return { success: true, id: result?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Resend] Token expiring alert error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Send a month-end close reminder (sent on the 25th of each month).
 */
export async function sendMonthEndReminder(
  orgEmail: string,
  entityName: string,
  readinessPercent: number
): Promise<EmailResult> {
  try {
    const resend = getResendClient();

    const readinessColor = readinessPercent >= 90 ? '#16a34a' : readinessPercent >= 70 ? '#f59e0b' : '#dc2626';
    const readinessLabel = readinessPercent >= 90 ? 'On Track' : readinessPercent >= 70 ? 'Needs Attention' : 'At Risk';

    const { data: result, error: sendError } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: orgEmail,
      subject: `📅 Month-End Reminder — ${escapeHtml(entityName)} (${readinessPercent}% Ready)`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
          <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 20px 24px; color: white;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 600;">📅 Month-End Close Reminder</h1>
              <p style="margin: 4px 0 0; opacity: 0.8; font-size: 13px;">${escapeHtml(entityName)}</p>
            </div>
            <div style="padding: 24px;">
              <!-- Readiness Gauge -->
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 48px; font-weight: 700; color: ${readinessColor};">${readinessPercent}%</div>
                <div style="font-size: 14px; color: #64748b;">
                  Close Readiness:
                  <span style="display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; background: ${readinessColor}20; color: ${readinessColor};">
                    ${readinessLabel}
                  </span>
                </div>
              </div>

              <!-- Progress Bar -->
              <div style="background: #e5e7eb; border-radius: 8px; height: 12px; margin-bottom: 24px; overflow: hidden;">
                <div style="background: ${readinessColor}; height: 100%; width: ${readinessPercent}%; border-radius: 8px; transition: width 0.3s;"></div>
              </div>

              <p style="font-size: 14px; color: #374151; line-height: 1.5; margin: 0 0 16px;">
                Month-end close is approaching. Here's a quick checklist:
              </p>
              <ul style="font-size: 13px; color: #374151; line-height: 1.8; padding-left: 20px; margin: 0 0 20px;">
                <li>Review and approve all pending transactions</li>
                <li>Ensure all receipts are collected</li>
                <li>Verify ledger sync is up to date</li>
                <li>Run reconciliation on all bank accounts</li>
              </ul>

              <div style="text-align: center;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com'}/dashboard"
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
                  Open Dashboard →
                </a>
              </div>
            </div>

            <div style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                Autokkeep — AI Financial Operations Platform<br>
                This reminder is sent automatically on the 25th of each month.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (sendError) {
      console.error('[Resend] Month-end reminder failed:', sendError);
      return { success: false, error: sendError.message };
    }

    return { success: true, id: result?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Resend] Month-end reminder error:', msg);
    return { success: false, error: msg };
  }
}
