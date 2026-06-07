// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — API Key Management Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createLogger } from '@/lib/logger';
import { hashApiKey } from '@/lib/api/public-api-auth';

const log = createLogger('api-key-manager');

// ── Types ────────────────────────────────────────────────────────────────────

export const VALID_PERMISSIONS = [
  'read:transactions',
  'write:transactions',
  'read:reports',
  'manage:webhooks',
  'read:entities',
  'manage:team',
] as const;

export type ApiKeyPermission = (typeof VALID_PERMISSIONS)[number];

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

export interface ApiKeyCreateResult {
  keyInfo: ApiKeyInfo;
  fullKey: string; // Only returned once at creation
}

export interface ApiKeyUsageStats {
  keyId: string;
  callsThisWeek: number;
  callsThisMonth: number;
  lastUsedAt: string | null;
}

interface DbClient {
  from: (table: string) => {
    select: (columns?: string, options?: { count?: 'exact'; head?: boolean }) => DbQueryChain;
    insert: (data: Record<string, unknown> | Record<string, unknown>[]) => DbQueryChain;
    update: (data: Record<string, unknown>) => DbQueryChain;
    delete: () => DbQueryChain;
  };
}

interface DbQueryChain {
  eq: (col: string, val: unknown) => DbQueryChain;
  neq: (col: string, val: unknown) => DbQueryChain;
  in: (col: string, vals: unknown[]) => DbQueryChain;
  is: (col: string, val: unknown) => DbQueryChain;
  gte: (col: string, val: unknown) => DbQueryChain;
  order: (col: string, options?: { ascending?: boolean }) => DbQueryChain;
  limit: (n: number) => DbQueryChain;
  single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  select: (columns?: string, options?: { count?: 'exact'; head?: boolean }) => DbQueryChain;
  [key: string]: unknown;
}

// ── List API Keys ────────────────────────────────────────────────────────────

export async function listApiKeys(
  db: DbClient,
  orgId: string
): Promise<{ keys: ApiKeyInfo[]; error: string | null }> {
  try {
    const { data, error } = await db
      .from('api_keys')
      .select('id, name, prefix, permissions, created_at, last_used_at, expires_at, is_active')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }) as unknown as { data: Record<string, unknown>[] | null; error: unknown };

    if (error) {
      log.error('Failed to list API keys', { orgId, error });
      return { keys: [], error: 'Failed to list API keys' };
    }

    const keys: ApiKeyInfo[] = (data || []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      prefix: row.prefix as string,
      permissions: (row.permissions as string[]) || [],
      createdAt: row.created_at as string,
      lastUsedAt: (row.last_used_at as string) || null,
      expiresAt: (row.expires_at as string) || null,
      isActive: row.is_active as boolean,
    }));

    return { keys, error: null };
  } catch (err) {
    log.error('Unexpected error listing API keys', { orgId, err });
    return { keys: [], error: 'Unexpected error' };
  }
}

// ── Create API Key ───────────────────────────────────────────────────────────

export async function createApiKey(
  db: DbClient,
  orgId: string,
  name: string,
  permissions: string[],
  expiresAt?: string
): Promise<{ result: ApiKeyCreateResult | null; error: string | null }> {
  try {
    if (!name || name.trim().length === 0) {
      return { result: null, error: 'Name is required' };
    }

    if (name.length > 100) {
      return { result: null, error: 'Name must be 100 characters or less' };
    }

    // Validate permissions
    const validPerms = permissions.filter((p) =>
      (VALID_PERMISSIONS as readonly string[]).includes(p)
    );
    if (validPerms.length === 0) {
      return { result: null, error: 'At least one valid permission is required' };
    }

    // Generate the raw API key
    const rawKey = generateApiKey();
    const prefix = rawKey.slice(0, 12); // 'ak_' + first 8 chars
    const keyHash = await hashApiKey(rawKey);

    const insertData: Record<string, unknown> = {
      org_id: orgId,
      name: name.trim(),
      prefix,
      key_hash: keyHash,
      permissions: validPerms,
      is_active: true,
    };

    if (expiresAt) {
      insertData.expires_at = expiresAt;
    }

    const { data, error } = await db
      .from('api_keys')
      .insert(insertData)
      .select('id, name, prefix, permissions, created_at, last_used_at, expires_at, is_active') as unknown as { data: Record<string, unknown>[] | null; error: unknown };

    if (error) {
      log.error('Failed to create API key', { orgId, name, error });
      return { result: null, error: 'Failed to create API key' };
    }

    const row = data?.[0];
    if (!row) {
      return { result: null, error: 'Failed to create API key' };
    }

    log.info('API key created', { orgId, name, keyId: row.id });

    return {
      result: {
        keyInfo: {
          id: row.id as string,
          name: row.name as string,
          prefix: row.prefix as string,
          permissions: (row.permissions as string[]) || [],
          createdAt: row.created_at as string,
          lastUsedAt: null,
          expiresAt: (row.expires_at as string) || null,
          isActive: true,
        },
        fullKey: rawKey,
      },
      error: null,
    };
  } catch (err) {
    log.error('Unexpected error creating API key', { orgId, name, err });
    return { result: null, error: 'Unexpected error' };
  }
}

// ── Revoke API Key ───────────────────────────────────────────────────────────

export async function revokeApiKey(
  db: DbClient,
  orgId: string,
  keyId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await db
      .from('api_keys')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('id', keyId)
      .eq('org_id', orgId)
      .is('deleted_at', null) as unknown as { error: unknown };

    if (error) {
      log.error('Failed to revoke API key', { orgId, keyId, error });
      return { success: false, error: 'Failed to revoke API key' };
    }

    log.info('API key revoked', { orgId, keyId });
    return { success: true, error: null };
  } catch (err) {
    log.error('Unexpected error revoking API key', { orgId, keyId, err });
    return { success: false, error: 'Unexpected error' };
  }
}

// ── API Key Usage Stats ──────────────────────────────────────────────────────

export async function getApiKeyUsageStats(
  db: DbClient,
  orgId: string,
  keyId: string
): Promise<{ stats: ApiKeyUsageStats | null; error: string | null }> {
  try {
    // Get key info
    const { data: keyData } = await db
      .from('api_keys')
      .select('id, last_used_at')
      .eq('id', keyId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .limit(1) as unknown as { data: Record<string, unknown>[] | null };

    if (!keyData || keyData.length === 0) {
      return { stats: null, error: 'API key not found' };
    }

    // Count calls this week and this month
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [weekRes, monthRes] = await Promise.all([
      db.from('api_key_usage')
        .select('id', { count: 'exact', head: true })
        .eq('api_key_id', keyId)
        .gte('created_at', weekAgo) as unknown as { count: number | null; error: unknown },
      db.from('api_key_usage')
        .select('id', { count: 'exact', head: true })
        .eq('api_key_id', keyId)
        .gte('created_at', monthAgo) as unknown as { count: number | null; error: unknown },
    ]);

    return {
      stats: {
        keyId,
        callsThisWeek: weekRes.count ?? 0,
        callsThisMonth: monthRes.count ?? 0,
        lastUsedAt: (keyData[0].last_used_at as string) || null,
      },
      error: null,
    };
  } catch (err) {
    log.error('Unexpected error fetching usage stats', { orgId, keyId, err });
    return { stats: null, error: 'Unexpected error' };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'ak_';
  for (let i = 0; i < 40; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}
