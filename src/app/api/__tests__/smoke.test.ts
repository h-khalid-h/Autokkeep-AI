/**
 * API Route Type Validation Tests
 * 
 * Validates that API route modules export the correct HTTP method handlers.
 * These are compile-time checks — actual request testing requires NextRequest mocks.
 */

import { describe, it, expect } from 'vitest';

describe('API Route Exports', () => {
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
  });

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
  });

  describe('Billing Routes', () => {
    it('checkout exports POST', async () => {
      const mod = await import('@/app/api/billing/checkout/route');
      expect(typeof mod.POST).toBe('function');
    });
  });

  describe('Health Route', () => {
    it('health exports GET', async () => {
      const mod = await import('@/app/api/health/route');
      expect(typeof mod.GET).toBe('function');
    });
  });

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
