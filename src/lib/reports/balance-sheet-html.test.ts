import { describe, it, expect } from 'vitest';
import { renderBalanceSheetHtml } from './balance-sheet-html';
import type { BalanceSheetReport } from './balance-sheet';

// ─── Test Data Factories ────────────────────────────────────────────────────────

function createBasicReport(overrides?: Partial<BalanceSheetReport>): BalanceSheetReport {
  return {
    entityName: 'Acme Corp',
    entityCurrency: 'USD',
    asOfDate: '2026-03-31',
    generatedAt: '2026-04-01T12:00:00.000Z',
    assets: [
      { code: '1000', name: 'Cash', amount: 50000, type: 'asset' },
      { code: '1200', name: 'Accounts Receivable', amount: 15000, type: 'asset' },
    ],
    totalAssets: 65000,
    liabilities: [
      { code: '2000', name: 'Accounts Payable', amount: 10000, type: 'liability' },
      { code: '2100', name: 'Notes Payable', amount: 5000, type: 'liability' },
    ],
    totalLiabilities: 15000,
    equity: [
      { code: '3000', name: 'Owner Equity', amount: 40000, type: 'equity' },
    ],
    totalEquity: 40000,
    isBalanced: true,
    retainedEarnings: 10000,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('balance-sheet-html - renderBalanceSheetHtml', () => {
  // ── Basic Structure ─────────────────────────────────────────────────

  describe('HTML document structure', () => {
    it('returns a valid HTML document with DOCTYPE', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    it('includes charset and viewport meta tags', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('<meta charset="UTF-8">');
      expect(html).toContain('<meta name="viewport"');
    });

    it('includes the entity name in the title', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('<title>Balance Sheet — Acme Corp</title>');
    });

    it('includes Autokkeep footer', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Autokkeep — AI-Powered Bookkeeping');
    });
  });

  // ── Header Content ────────────────────────────────────────────────────

  describe('header content', () => {
    it('displays the entity name', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Acme Corp');
    });

    it('displays "Balance Sheet" title', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Balance Sheet');
    });

    it('displays "As of" date', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('As of');
      expect(html).toContain('March');
      expect(html).toContain('2026');
    });

    it('displays generated date', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Generated on');
      expect(html).toContain('April');
    });
  });

  // ── Balance Status ────────────────────────────────────────────────────

  describe('balance status indicator', () => {
    it('shows "✓ Balanced" in green when balanced', () => {
      const html = renderBalanceSheetHtml(createBasicReport({ isBalanced: true }));
      expect(html).toContain('✓ Balanced');
      expect(html).toContain('#16a34a');
    });

    it('shows "✗ Out of Balance" in red when not balanced', () => {
      const html = renderBalanceSheetHtml(createBasicReport({ isBalanced: false }));
      expect(html).toContain('✗ Out of Balance');
      expect(html).toContain('#dc2626');
    });
  });

  // ── Assets Section ────────────────────────────────────────────────────

  describe('assets section', () => {
    it('includes ASSETS section header', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('ASSETS');
    });

    it('renders all asset line items', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Cash');
      expect(html).toContain('Accounts Receivable');
      expect(html).toContain('1000');
      expect(html).toContain('1200');
    });

    it('shows Total Assets with formatted amount', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Total Assets');
      expect(html).toContain('$65,000.00');
    });
  });

  // ── Liabilities Section ───────────────────────────────────────────────

  describe('liabilities section', () => {
    it('includes LIABILITIES section header', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('LIABILITIES');
    });

    it('renders all liability line items', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Accounts Payable');
      expect(html).toContain('Notes Payable');
    });

    it('shows Total Liabilities', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Total Liabilities');
      expect(html).toContain('$15,000.00');
    });
  });

  // ── Equity Section ────────────────────────────────────────────────────

  describe('equity section', () => {
    it('includes EQUITY section header', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('EQUITY');
    });

    it('renders equity line items', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Owner Equity');
      expect(html).toContain('3000');
    });

    it('shows Total Equity', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Total Equity');
      expect(html).toContain('$40,000.00');
    });
  });

  // ── Retained Earnings ─────────────────────────────────────────────────

  describe('retained earnings', () => {
    it('shows Retained Earnings row', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('Retained Earnings');
    });

    it('shows positive retained earnings in green', () => {
      const html = renderBalanceSheetHtml(createBasicReport({ retainedEarnings: 10000 }));
      expect(html).toContain('$10,000.00');
      // Green color for positive
      expect(html).toContain('#16a34a');
    });

    it('shows negative retained earnings in red', () => {
      const html = renderBalanceSheetHtml(createBasicReport({ retainedEarnings: -5000 }));
      expect(html).toContain('-$5,000.00');
      expect(html).toContain('#dc2626');
    });

    it('shows zero retained earnings in green', () => {
      const html = renderBalanceSheetHtml(createBasicReport({ retainedEarnings: 0 }));
      expect(html).toContain('Retained Earnings');
    });
  });

  // ── Total Liabilities + Equity + RE ───────────────────────────────────

  describe('total liabilities + equity + retained earnings', () => {
    it('shows the combined total', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('TOTAL LIABILITIES + EQUITY + RETAINED EARNINGS');
      // 15000 + 40000 + 10000 = 65000
      expect(html).toContain('$65,000.00');
    });

    it('computes correctly when values differ', () => {
      const html = renderBalanceSheetHtml(createBasicReport({
        totalLiabilities: 20000,
        totalEquity: 30000,
        retainedEarnings: 5000,
      }));
      // 20000 + 30000 + 5000 = 55000
      expect(html).toContain('$55,000.00');
    });
  });

  // ── Currency Formatting ───────────────────────────────────────────────

  describe('currency formatting', () => {
    it('uses $ for USD', () => {
      const html = renderBalanceSheetHtml(createBasicReport({ entityCurrency: 'USD' }));
      expect(html).toContain('$50,000.00');
    });

    it('uses € for EUR', () => {
      const html = renderBalanceSheetHtml(createBasicReport({ entityCurrency: 'EUR' }));
      expect(html).toContain('€50,000.00');
    });

    it('uses £ for GBP', () => {
      const html = renderBalanceSheetHtml(createBasicReport({ entityCurrency: 'GBP' }));
      expect(html).toContain('£50,000.00');
    });

    it('uses ¥ for JPY', () => {
      const html = renderBalanceSheetHtml(createBasicReport({ entityCurrency: 'JPY' }));
      expect(html).toContain('¥50,000.00');
    });

    it('uses currency code prefix for unknown currencies', () => {
      const html = renderBalanceSheetHtml(createBasicReport({ entityCurrency: 'BRL' }));
      expect(html).toContain('BRL 50,000.00');
    });

    it('includes currency in footer', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('All amounts are in USD');
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty arrays for all sections', () => {
      const html = renderBalanceSheetHtml(createBasicReport({
        assets: [],
        totalAssets: 0,
        liabilities: [],
        totalLiabilities: 0,
        equity: [],
        totalEquity: 0,
        retainedEarnings: 0,
      }));
      expect(html).toContain('ASSETS');
      expect(html).toContain('LIABILITIES');
      expect(html).toContain('EQUITY');
      expect(html).toContain('$0.00');
    });

    it('handles zero-value line items', () => {
      const html = renderBalanceSheetHtml(createBasicReport({
        assets: [{ code: '1000', name: 'Empty Cash', amount: 0, type: 'asset' }],
      }));
      expect(html).toContain('Empty Cash');
      expect(html).toContain('$0.00');
    });

    it('handles very large amounts', () => {
      const html = renderBalanceSheetHtml(createBasicReport({
        totalAssets: 999999999.99,
      }));
      expect(html).toContain('$999,999,999.99');
    });

    it('handles negative asset values', () => {
      const html = renderBalanceSheetHtml(createBasicReport({
        assets: [{ code: '1000', name: 'Overdrawn', amount: -500, type: 'asset' }],
      }));
      expect(html).toContain('-$500.00');
    });
  });

  // ── HTML Escaping ─────────────────────────────────────────────────────

  describe('HTML escaping', () => {
    it('escapes entity name with special characters', () => {
      const html = renderBalanceSheetHtml(createBasicReport({
        entityName: 'O Brien & Associates <LLC>',
      }));
      expect(html).toContain('O Brien &amp; Associates &lt;LLC&gt;');
    });

    it('escapes account names against XSS', () => {
      const html = renderBalanceSheetHtml(createBasicReport({
        assets: [
          { code: '1000', name: '<img onerror="alert(1)">', amount: 100, type: 'asset' },
        ],
      }));
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    });

    it('escapes account codes', () => {
      const html = renderBalanceSheetHtml(createBasicReport({
        assets: [
          { code: '10"00', name: 'Test', amount: 100, type: 'asset' },
        ],
      }));
      expect(html).toContain('10&quot;00');
    });

    it('escapes currency in footer', () => {
      const html = renderBalanceSheetHtml(createBasicReport({
        entityCurrency: '<script>',
      }));
      expect(html).toContain('&lt;script&gt;');
    });
  });

  // ── Table Structure ───────────────────────────────────────────────────

  describe('table structure', () => {
    it('has Code, Account, and Amount column headers', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('>Code</th>');
      expect(html).toContain('>Account</th>');
      expect(html).toContain('>Amount</th>');
    });

    it('has 3 columns (no comparison columns)', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain('colspan="3"');
    });

    it('uses monospace font for amount cells', () => {
      const html = renderBalanceSheetHtml(createBasicReport());
      expect(html).toContain("'Courier New', monospace");
    });
  });
});
