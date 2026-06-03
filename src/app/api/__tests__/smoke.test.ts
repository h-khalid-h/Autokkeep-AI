/**
 * API Route Type Validation Tests
 * 
 * Validates that API route modules export the correct HTTP method handlers.
 * These are compile-time checks — actual request testing requires NextRequest mocks.
 */

import { describe, it, expect } from 'vitest';

describe('API Route Exports', () => {
  // ── Transaction Routes ──────────────────────────────────────────────
  describe('Transaction Routes', () => {
    it('transactions route exports GET and POST', async () => {
      const mod = await import('@/app/api/transactions/route');
      expect(typeof mod.GET).toBe('function');
      expect(typeof mod.POST).toBe('function');
    });

    it('transactions batch route exports POST', async () => {
      const mod = await import('@/app/api/transactions/batch/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('transactions export route exports GET', async () => {
      const mod = await import('@/app/api/transactions/export/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('transactions process route exports POST', async () => {
      const mod = await import('@/app/api/transactions/process/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('transactions [id]/receipt route exports POST', async () => {
      const mod = await import('@/app/api/transactions/[id]/receipt/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  // ── Auth Routes ─────────────────────────────────────────────────────
  describe('Auth Routes', () => {
    it('logout exports POST', async () => {
      const mod = await import('@/app/api/auth/logout/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  // ── Billing Routes ──────────────────────────────────────────────────
  describe('Billing Routes', () => {
    it('checkout exports POST', async () => {
      const mod = await import('@/app/api/billing/checkout/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('portal exports POST', async () => {
      const mod = await import('@/app/api/billing/portal/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  // ── Webhook Routes ──────────────────────────────────────────────────
  describe('Webhook Routes', () => {
    it('twilio webhook exports POST', async () => {
      const mod = await import('@/app/api/webhooks/twilio/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  // ── Channel Routes ──────────────────────────────────────────────────
  describe('Channel Routes', () => {
    it('dispatch exports POST', async () => {
      const mod = await import('@/app/api/channels/dispatch/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('slack/events exports POST', async () => {
      const mod = await import('@/app/api/channels/slack/events/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('slack/install exports GET and POST', async () => {
      const mod = await import('@/app/api/channels/slack/install/route');
      expect(typeof mod.GET).toBe('function');
      expect(typeof mod.POST).toBe('function');
    });

    it('slack/interact exports POST', async () => {
      const mod = await import('@/app/api/channels/slack/interact/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('sms exports POST', async () => {
      const mod = await import('@/app/api/channels/sms/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('teams/webhook exports POST', async () => {
      const mod = await import('@/app/api/channels/teams/webhook/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('whatsapp exports POST', async () => {
      const mod = await import('@/app/api/channels/whatsapp/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  // ── Compliance Routes ───────────────────────────────────────────────
  describe('Compliance Routes', () => {
    it('check exports POST', async () => {
      const mod = await import('@/app/api/compliance/check/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  // ── Cron Routes ─────────────────────────────────────────────────────
  describe('Cron Routes', () => {
    it('plaid-sync exports GET', async () => {
      const mod = await import('@/app/api/cron/plaid-sync/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('receipt-chase exports GET', async () => {
      const mod = await import('@/app/api/cron/receipt-chase/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('weekly-digest exports GET', async () => {
      const mod = await import('@/app/api/cron/weekly-digest/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('auto-categorize exports POST', async () => {
      const mod = await import('@/app/api/cron/auto-categorize/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('ledger-sync exports GET', async () => {
      const mod = await import('@/app/api/cron/ledger-sync/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('suspense-timeout exports GET', async () => {
      const mod = await import('@/app/api/cron/suspense-timeout/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('token-refresh exports GET', async () => {
      const mod = await import('@/app/api/cron/token-refresh/route');
      expect(typeof mod.GET).toBe('function');
    });
  });

  // ── Dashboard Routes ────────────────────────────────────────────────
  describe('Dashboard Routes', () => {
    it('stats exports GET', async () => {
      const mod = await import('@/app/api/dashboard/stats/route');
      expect(typeof mod.GET).toBe('function');
    });
  });

  // ── Insights Routes ─────────────────────────────────────────────────
  describe('Insights Routes', () => {
    it('close exports GET and POST', async () => {
      const mod = await import('@/app/api/insights/close/route');
      expect(typeof mod.GET).toBe('function');
      expect(typeof mod.POST).toBe('function');
    });

    it('health exports GET and PATCH', async () => {
      const mod = await import('@/app/api/insights/health/route');
      expect(typeof mod.GET).toBe('function');
      expect(typeof mod.PATCH).toBe('function');
    });

    it('narrative exports GET and POST', async () => {
      const mod = await import('@/app/api/insights/narrative/route');
      expect(typeof mod.GET).toBe('function');
      expect(typeof mod.POST).toBe('function');
    });
  });

  // ── Ledger Routes ───────────────────────────────────────────────────
  describe('Ledger Routes', () => {
    it('export exports GET', async () => {
      const mod = await import('@/app/api/ledger/export/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('quickbooks/auth exports GET and POST', async () => {
      const mod = await import('@/app/api/ledger/quickbooks/auth/route');
      expect(typeof mod.GET).toBe('function');
      expect(typeof mod.POST).toBe('function');
    });

    it('quickbooks/sync exports POST and GET', async () => {
      const mod = await import('@/app/api/ledger/quickbooks/sync/route');
      expect(typeof mod.POST).toBe('function');
      expect(typeof mod.GET).toBe('function');
    });

    it('xero/auth exports GET and POST', async () => {
      const mod = await import('@/app/api/ledger/xero/auth/route');
      expect(typeof mod.GET).toBe('function');
      expect(typeof mod.POST).toBe('function');
    });

    it('xero/sync exports POST and GET', async () => {
      const mod = await import('@/app/api/ledger/xero/sync/route');
      expect(typeof mod.POST).toBe('function');
      expect(typeof mod.GET).toBe('function');
    });
  });

  // ── Plaid Routes ────────────────────────────────────────────────────
  describe('Plaid Routes', () => {
    it('disconnect exports POST', async () => {
      const mod = await import('@/app/api/plaid/disconnect/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('exchange exports POST', async () => {
      const mod = await import('@/app/api/plaid/exchange/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('link-token exports POST', async () => {
      const mod = await import('@/app/api/plaid/link-token/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('reconnect exports POST', async () => {
      const mod = await import('@/app/api/plaid/reconnect/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('sync exports POST', async () => {
      const mod = await import('@/app/api/plaid/sync/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  // ── Portfolio Route ─────────────────────────────────────────────────
  describe('Portfolio Route', () => {
    it('portfolio exports GET', async () => {
      const mod = await import('@/app/api/portfolio/route');
      expect(typeof mod.GET).toBe('function');
    });
  });

  // ── Tax Routes ──────────────────────────────────────────────────────
  describe('Tax Routes', () => {
    it('readiness exports GET', async () => {
      const mod = await import('@/app/api/tax/readiness/route');
      expect(typeof mod.GET).toBe('function');
    });
  });

  // ── Admin Routes ────────────────────────────────────────────────────
  describe('Admin Routes', () => {
    it('organizations exports GET', async () => {
      const mod = await import('@/app/api/admin/organizations/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('stats exports GET', async () => {
      const mod = await import('@/app/api/admin/stats/route');
      expect(typeof mod.GET).toBe('function');
    });

    it('system exports GET', async () => {
      const mod = await import('@/app/api/admin/system/route');
      expect(typeof mod.GET).toBe('function');
    });
  });

  // ── Audit Route ─────────────────────────────────────────────────────
  describe('Audit Route', () => {
    it('audit exports GET', async () => {
      const mod = await import('@/app/api/audit/route');
      expect(typeof mod.GET).toBe('function');
    });
  });

  // ── AI Routes ───────────────────────────────────────────────────────
  describe('AI Routes', () => {
    it('batch exports POST', async () => {
      const mod = await import('@/app/api/ai/batch/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('categorize exports POST', async () => {
      const mod = await import('@/app/api/ai/categorize/route');
      expect(typeof mod.POST).toBe('function');
    });

    it('chat exports POST and GET', async () => {
      const mod = await import('@/app/api/ai/chat/route');
      expect(typeof mod.POST).toBe('function');
      expect(typeof mod.GET).toBe('function');
    });
  });

  // ── Health Route ────────────────────────────────────────────────────
  describe('Health Route', () => {
    it('health exports GET', async () => {
      const mod = await import('@/app/api/health/route');
      expect(typeof mod.GET).toBe('function');
    });
  });

  // ── Chart of Accounts Route ─────────────────────────────────────────
  describe('Chart of Accounts Route', () => {
    it('exports GET, POST, PUT, DELETE', async () => {
      const mod = await import('@/app/api/chart-of-accounts/route');
      expect(typeof mod.GET).toBe('function');
      expect(typeof mod.POST).toBe('function');
      expect(typeof mod.PUT).toBe('function');
      expect(typeof mod.DELETE).toBe('function');
    });
  });
});
