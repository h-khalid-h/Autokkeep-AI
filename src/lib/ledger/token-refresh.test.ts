import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the sync module (QBO/Xero refresh functions) ───────────────────────

vi.mock('./sync', () => ({
  refreshQBOToken: vi.fn(),
  refreshXeroToken: vi.fn(),
}));

import { refreshConnectionToken, computeTokenExpiresAt } from './token-refresh';
import type { LedgerConnectionRow } from './token-refresh';
import { refreshQBOToken, refreshXeroToken } from './sync';

const mockedRefreshQBO = vi.mocked(refreshQBOToken);
const mockedRefreshXero = vi.mocked(refreshXeroToken);

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeConnection(overrides: Partial<LedgerConnectionRow> = {}): LedgerConnectionRow {
  return {
    id: 'conn-1',
    entity_id: 'entity-1',
    provider: 'quickbooks',
    access_token: 'old-access',
    refresh_token: 'old-refresh',
    realm_id: 'realm-123',
    tenant_id: null,
    is_active: true,
    token_expires_at: '2026-01-01T00:00:00Z',
    refresh_failures: 0,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('token-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── refreshConnectionToken ──────────────────────────────────────────────

  describe('refreshConnectionToken', () => {
    it('refreshes a QuickBooks token via refreshQBOToken', async () => {
      mockedRefreshQBO.mockResolvedValue({
        accessToken: 'new-qbo-access',
        refreshToken: 'new-qbo-refresh',
        expiresIn: 3600,
      });

      const connection = makeConnection({ provider: 'quickbooks' });
      const result = await refreshConnectionToken(connection);

      expect(mockedRefreshQBO).toHaveBeenCalledWith('old-refresh');
      expect(result).toEqual({
        accessToken: 'new-qbo-access',
        refreshToken: 'new-qbo-refresh',
        expiresIn: 3600,
      });
    });

    it('refreshes a Xero token via refreshXeroToken', async () => {
      mockedRefreshXero.mockResolvedValue({
        accessToken: 'new-xero-access',
        refreshToken: 'new-xero-refresh',
        expiresIn: 1800,
      });

      const connection = makeConnection({
        provider: 'xero',
        tenant_id: 'tenant-1',
        realm_id: null,
      });
      const result = await refreshConnectionToken(connection);

      expect(mockedRefreshXero).toHaveBeenCalledWith('old-refresh');
      expect(result).toEqual({
        accessToken: 'new-xero-access',
        refreshToken: 'new-xero-refresh',
        expiresIn: 1800,
      });
    });

    it('throws when refresh_token is null (expired refresh token)', async () => {
      const connection = makeConnection({ refresh_token: null });

      await expect(refreshConnectionToken(connection)).rejects.toThrow(
        'No refresh token available'
      );
      expect(mockedRefreshQBO).not.toHaveBeenCalled();
    });

    it('throws for unsupported provider', async () => {
      const connection = makeConnection({
        provider: 'sage' as LedgerConnectionRow['provider'],
      });

      await expect(refreshConnectionToken(connection)).rejects.toThrow(
        'Unsupported provider: sage'
      );
    });

    it('propagates network errors from QBO refresh', async () => {
      mockedRefreshQBO.mockRejectedValue(new Error('Network timeout'));

      const connection = makeConnection({ provider: 'quickbooks' });

      await expect(refreshConnectionToken(connection)).rejects.toThrow('Network timeout');
    });

    it('propagates network errors from Xero refresh', async () => {
      mockedRefreshXero.mockRejectedValue(new Error('Connection refused'));

      const connection = makeConnection({
        provider: 'xero',
        tenant_id: 'tenant-1',
      });

      await expect(refreshConnectionToken(connection)).rejects.toThrow('Connection refused');
    });
  });

  // ── computeTokenExpiresAt ───────────────────────────────────────────────

  describe('computeTokenExpiresAt', () => {
    it('returns an ISO timestamp expiresIn seconds in the future', () => {
      const before = Date.now();
      const result = computeTokenExpiresAt(3600);
      const after = Date.now();

      const resultMs = new Date(result).getTime();
      // The result should be ~3600s in the future (within a small tolerance)
      expect(resultMs).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(resultMs).toBeLessThanOrEqual(after + 3600 * 1000);
    });

    it('returns a valid ISO 8601 string', () => {
      const result = computeTokenExpiresAt(1);
      expect(new Date(result).toISOString()).toBe(result);
    });

    it('handles zero expiresIn', () => {
      const before = Date.now();
      const result = computeTokenExpiresAt(0);
      const resultMs = new Date(result).getTime();
      expect(resultMs).toBeGreaterThanOrEqual(before);
      expect(resultMs).toBeLessThanOrEqual(before + 100); // within 100ms
    });
  });
});
