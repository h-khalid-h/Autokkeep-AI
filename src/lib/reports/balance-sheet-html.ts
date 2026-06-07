// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Balance Sheet HTML Renderer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Renders a BalanceSheetReport into a standalone HTML string with inline CSS.
// Suitable for PDF generation, email embedding, or direct browser display.

import type { BalanceSheetReport, BalanceSheetLineItem } from './balance-sheet';

// ─── Formatting Helpers ─────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$',
    JPY: '¥', CHF: 'CHF ', AED: 'AED ', SAR: 'SAR ',
  };
  const sym = symbols[currency] || `${currency} `;
  return `${sign}${sym}${abs}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── HTML Generation ────────────────────────────────────────────────────────────

function renderLineItemRows(
  items: BalanceSheetLineItem[],
  currency: string
): string {
  return items
    .map(
      (item) => `
        <tr>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #555; font-size: 13px;">${escapeHtml(item.code)}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${escapeHtml(item.name)}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eee; text-align: right; font-family: 'Courier New', monospace;">${formatCurrency(item.amount, currency)}</td>
        </tr>`
    )
    .join('\n');
}

/**
 * Renders a BalanceSheetReport as a standalone HTML document string.
 * Uses only inline CSS for maximum compatibility with PDF renderers.
 */
export function renderBalanceSheetHtml(report: BalanceSheetReport): string {
  const { entityName, entityCurrency: currency, asOfDate, generatedAt } = report;

  const balancedColor = report.isBalanced ? '#16a34a' : '#dc2626';
  const balancedText = report.isBalanced ? '✓ Balanced' : '✗ Out of Balance';
  const retainedEarningsColor = report.retainedEarnings >= 0 ? '#16a34a' : '#dc2626';

  // Liabilities + Equity + Retained Earnings
  const totalLiabilitiesAndEquity = report.totalLiabilities + report.totalEquity + report.retainedEarnings;

  // ── Asset Rows ──────────────────────────────────────────────────────────
  const assetRows = renderLineItemRows(report.assets, currency);

  // ── Liability Rows ──────────────────────────────────────────────────────
  const liabilityRows = renderLineItemRows(report.liabilities, currency);

  // ── Equity Rows ─────────────────────────────────────────────────────────
  const equityRows = renderLineItemRows(report.equity, currency);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Balance Sheet — ${escapeHtml(entityName)}</title>
</head>
<body style="margin: 0; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; line-height: 1.5;">

  <!-- Header -->
  <div style="text-align: center; margin-bottom: 32px; border-bottom: 2px solid #333; padding-bottom: 20px;">
    <h1 style="margin: 0 0 4px; font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(entityName)}</h1>
    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 400; color: #555;">Balance Sheet</h2>
    <p style="margin: 0; font-size: 13px; color: #777;">As of ${formatDate(asOfDate)}</p>
    <p style="margin: 8px 0 0; font-size: 11px; color: #999;">Generated on ${formatDate(generatedAt)}</p>
    <p style="margin: 8px 0 0; font-size: 13px; font-weight: 600; color: ${balancedColor};">${balancedText}</p>
  </div>

  <!-- Balance Sheet Table -->
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <thead>
      <tr style="background: #f8f9fa;">
        <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: #666; border-bottom: 2px solid #333; width: 80px;">Code</th>
        <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: #666; border-bottom: 2px solid #333;">Account</th>
        <th style="padding: 8px 12px; text-align: right; font-weight: 600; color: #666; border-bottom: 2px solid #333; width: 140px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <!-- Assets Section Header -->
      <tr>
        <td colspan="3" style="padding: 14px 12px 6px; font-weight: 700; font-size: 15px; color: #1a1a1a; border-bottom: 1px solid #ddd; background: #f0fdf4;">ASSETS</td>
      </tr>
      ${assetRows}
      <!-- Assets Total -->
      <tr style="background: #f8f9fa;">
        <td style="padding: 8px 12px; border-top: 1px solid #999;"></td>
        <td style="padding: 8px 12px; font-weight: 700; border-top: 1px solid #999;">Total Assets</td>
        <td style="padding: 8px 12px; text-align: right; font-family: 'Courier New', monospace; border-top: 1px solid #999; font-weight: 700;">${formatCurrency(report.totalAssets, currency)}</td>
      </tr>

      <!-- Spacer -->
      <tr><td colspan="3" style="padding: 8px;"></td></tr>

      <!-- Liabilities Section Header -->
      <tr>
        <td colspan="3" style="padding: 14px 12px 6px; font-weight: 700; font-size: 15px; color: #1a1a1a; border-bottom: 1px solid #ddd; background: #fef2f2;">LIABILITIES</td>
      </tr>
      ${liabilityRows}
      <!-- Liabilities Total -->
      <tr style="background: #f8f9fa;">
        <td style="padding: 8px 12px; border-top: 1px solid #999;"></td>
        <td style="padding: 8px 12px; font-weight: 700; border-top: 1px solid #999;">Total Liabilities</td>
        <td style="padding: 8px 12px; text-align: right; font-family: 'Courier New', monospace; border-top: 1px solid #999; font-weight: 700;">${formatCurrency(report.totalLiabilities, currency)}</td>
      </tr>

      <!-- Spacer -->
      <tr><td colspan="3" style="padding: 8px;"></td></tr>

      <!-- Equity Section Header -->
      <tr>
        <td colspan="3" style="padding: 14px 12px 6px; font-weight: 700; font-size: 15px; color: #1a1a1a; border-bottom: 1px solid #ddd; background: #eff6ff;">EQUITY</td>
      </tr>
      ${equityRows}
      <!-- Retained Earnings -->
      <tr>
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #555; font-size: 13px; font-style: italic;">—</td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-style: italic;">Retained Earnings</td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee; text-align: right; font-family: 'Courier New', monospace; color: ${retainedEarningsColor};">${formatCurrency(report.retainedEarnings, currency)}</td>
      </tr>
      <!-- Equity Total -->
      <tr style="background: #f8f9fa;">
        <td style="padding: 8px 12px; border-top: 1px solid #999;"></td>
        <td style="padding: 8px 12px; font-weight: 700; border-top: 1px solid #999;">Total Equity</td>
        <td style="padding: 8px 12px; text-align: right; font-family: 'Courier New', monospace; border-top: 1px solid #999; font-weight: 700;">${formatCurrency(report.totalEquity, currency)}</td>
      </tr>

      <!-- Spacer -->
      <tr><td colspan="3" style="padding: 8px;"></td></tr>

      <!-- Total Liabilities + Equity + Retained Earnings -->
      <tr style="background: #fafafa;">
        <td style="padding: 10px 12px; border-top: 3px double #333;"></td>
        <td style="padding: 10px 12px; font-weight: 700; font-size: 15px; border-top: 3px double #333;">TOTAL LIABILITIES + EQUITY + RETAINED EARNINGS</td>
        <td style="padding: 10px 12px; text-align: right; font-family: 'Courier New', monospace; border-top: 3px double #333; font-weight: 700; font-size: 15px;">${formatCurrency(totalLiabilitiesAndEquity, currency)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Footer -->
  <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #999;">
    <p style="margin: 0;">Autokkeep — AI-Powered Bookkeeping</p>
    <p style="margin: 4px 0 0;">This report was generated automatically. All amounts are in ${escapeHtml(currency)}.</p>
  </div>

</body>
</html>`;
}
