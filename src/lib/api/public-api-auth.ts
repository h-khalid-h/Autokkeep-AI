// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Public API v1 Authentication
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// API key authentication for the public /api/v1/* endpoints.
// Keys are hashed with SHA-256 and looked up in-memory (mock).
// In production, replace the in-memory store with a Supabase table.

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('public-api-auth');

// ── Types ────────────────────────────────────────────────────────────────────

export interface PublicApiKey {
  id: string;
  orgId: string;
  keyHash: string;
  name: string;
  permissions: string[];
  rateLimit: number;
  createdAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
}

export interface PublicApiContext {
  orgId: string;
  apiKeyId: string;
  permissions: string[];
}

// ── SHA-256 Hashing ──────────────────────────────────────────────────────────

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── In-Memory Key Store (Mock) ───────────────────────────────────────────────
// In production, replace with: SELECT * FROM api_keys WHERE key_hash = $1

const keyStore = new Map<string, PublicApiKey>();

/**
 * Register an API key in the in-memory store (for testing/bootstrapping).
 * In production, this would be a database insert.
 */
export async function registerApiKey(
  rawKey: string,
  config: {
    id: string;
    orgId: string;
    name: string;
    permissions?: string[];
    rateLimit?: number;
    isActive?: boolean;
  }
): Promise<PublicApiKey> {
  const keyHash = await hashApiKey(rawKey);
  const entry: PublicApiKey = {
    id: config.id,
    orgId: config.orgId,
    keyHash,
    name: config.name,
    permissions: config.permissions ?? ['read:transactions', 'read:entities'],
    rateLimit: config.rateLimit ?? 100,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    isActive: config.isActive ?? true,
  };
  keyStore.set(keyHash, entry);
  return entry;
}

/**
 * Remove all keys from the in-memory store (for testing).
 */
export function clearApiKeys(): void {
  keyStore.clear();
}

/**
 * Get an API key entry by its hash (for testing/inspection).
 */
export function getApiKeyByHash(hash: string): PublicApiKey | undefined {
  return keyStore.get(hash);
}

// ── Key Validation ───────────────────────────────────────────────────────────

/**
 * Validates the X-API-Key header against the key store.
 * Returns the org context on success, or a 401 NextResponse on failure.
 *
 * @example
 * const ctx = await validateApiKey(request);
 * if (ctx instanceof NextResponse) return ctx;
 * // ctx is PublicApiContext
 */
export async function validateApiKey(
  request: NextRequest
): Promise<PublicApiContext | NextResponse> {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    log.warn('Missing X-API-Key header', {
      path: new URL(request.url).pathname,
    });
    return NextResponse.json(
      { error: 'Missing API key. Provide it via the X-API-Key header.' },
      { status: 401 }
    );
  }

  const keyHash = await hashApiKey(apiKey);
  const entry = keyStore.get(keyHash);

  if (!entry) {
    log.warn('Invalid API key', { keyPrefix: apiKey.slice(0, 8) + '...' });
    return NextResponse.json(
      { error: 'Invalid API key.' },
      { status: 401 }
    );
  }

  if (!entry.isActive) {
    log.warn('Inactive API key used', { apiKeyId: entry.id, orgId: entry.orgId });
    return NextResponse.json(
      { error: 'API key is inactive. Contact your administrator.' },
      { status: 401 }
    );
  }

  // Track usage
  entry.lastUsedAt = new Date().toISOString();

  log.info('API key authenticated', {
    apiKeyId: entry.id,
    orgId: entry.orgId,
  });

  return {
    orgId: entry.orgId,
    apiKeyId: entry.id,
    permissions: entry.permissions,
  };
}
