// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — OAuth Token Refresh Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { refreshQBOToken, refreshXeroToken } from './sync';
import type { LedgerProvider } from './sync';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LedgerConnectionRow {
  id: string;
  entity_id: string;
  provider: LedgerProvider;
  access_token: string | null;
  refresh_token: string | null;
  realm_id: string | null;
  tenant_id: string | null;
  is_active: boolean;
  token_expires_at: string | null;
  refresh_failures?: number;
}

export interface TokenRefreshResult {
  connectionId: string;
  provider: LedgerProvider;
  success: boolean;
  error?: string;
}

// ─── Refresh a single connection's token ───────────────────────────────────────

export async function refreshConnectionToken(
  connection: LedgerConnectionRow
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  if (!connection.refresh_token) {
    throw new Error('No refresh token available');
  }

  switch (connection.provider) {
    case 'quickbooks': {
      const result = await refreshQBOToken(connection.refresh_token);
      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      };
    }

    case 'xero': {
      const result = await refreshXeroToken(connection.refresh_token);
      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      };
    }

    default:
      throw new Error(`Unsupported provider: ${connection.provider}`);
  }
}

// ─── Compute new expiry timestamp ──────────────────────────────────────────────

export function computeTokenExpiresAt(expiresIn: number): string {
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  return expiresAt.toISOString();
}
