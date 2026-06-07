import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// Mock hashApiKey
vi.mock('@/lib/api/public-api-auth', () => ({
  hashApiKey: vi.fn().mockResolvedValue('hashed_key_value'),
}));

import { listApiKeys, createApiKey, revokeApiKey, getApiKeyUsageStats, VALID_PERMISSIONS } from './manager';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createMockDb(overrides?: {
  selectData?: Record<string, unknown>[] | null;
  selectError?: unknown;
  insertData?: Record<string, unknown>[] | null;
  insertError?: unknown;
  updateError?: unknown;
}) {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.neq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.gte = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue({
      ...chain,
      data: overrides?.selectData ?? [],
      error: overrides?.selectError ?? null,
    });
    chain.data = overrides?.selectData ?? [];
    chain.error = overrides?.selectError ?? null;
    chain.count = 0;
    return chain;
  };

  const insertChain = {
    select: vi.fn().mockReturnValue({
      data: overrides?.insertData ?? [{
        id: 'key-1',
        name: 'Test Key',
        prefix: 'ak_testtest',
        permissions: ['read:transactions'],
        created_at: '2026-06-07T00:00:00Z',
        last_used_at: null,
        expires_at: null,
        is_active: true,
      }],
      error: overrides?.insertError ?? null,
    }),
  };

  const updateChain: Record<string, unknown> = {};
  updateChain.eq = vi.fn().mockReturnValue(updateChain);
  updateChain.is = vi.fn().mockReturnValue({
    error: overrides?.updateError ?? null,
  });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(makeSelectChain()),
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('API Key Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VALID_PERMISSIONS', () => {
    it('should contain expected permission strings', () => {
      expect(VALID_PERMISSIONS).toContain('read:transactions');
      expect(VALID_PERMISSIONS).toContain('write:transactions');
      expect(VALID_PERMISSIONS).toContain('read:reports');
      expect(VALID_PERMISSIONS).toContain('manage:webhooks');
      expect(VALID_PERMISSIONS).toContain('read:entities');
      expect(VALID_PERMISSIONS).toContain('manage:team');
    });
  });

  describe('listApiKeys', () => {
    it('should return API keys for an org', async () => {
      const mockKeys = [
        { id: 'k-1', name: 'Key 1', prefix: 'ak_12345678', permissions: ['read:transactions'], created_at: '2026-06-01T00:00:00Z', last_used_at: null, expires_at: null, is_active: true },
        { id: 'k-2', name: 'Key 2', prefix: 'ak_87654321', permissions: ['read:reports'], created_at: '2026-06-02T00:00:00Z', last_used_at: '2026-06-07T00:00:00Z', expires_at: '2026-12-01T00:00:00Z', is_active: true },
      ];
      const db = createMockDb({ selectData: mockKeys });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await listApiKeys(db as any, 'org-1');

      expect(result.error).toBeNull();
      expect(result.keys).toHaveLength(2);
      expect(result.keys[0].name).toBe('Key 1');
      expect(result.keys[1].lastUsedAt).toBe('2026-06-07T00:00:00Z');
    });

    it('should return empty array on DB error', async () => {
      const db = createMockDb({ selectData: null, selectError: { message: 'DB error' } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await listApiKeys(db as any, 'org-1');

      expect(result.error).toBe('Failed to list API keys');
      expect(result.keys).toHaveLength(0);
    });

    it('should handle null data gracefully', async () => {
      const db = createMockDb({ selectData: null });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await listApiKeys(db as any, 'org-1');

      // null data with no error => empty list
      expect(result.keys).toHaveLength(0);
    });
  });

  describe('createApiKey', () => {
    it('should create an API key with valid data', async () => {
      const db = createMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createApiKey(db as any, 'org-1', 'My Key', ['read:transactions']);

      expect(result.error).toBeNull();
      expect(result.result).not.toBeNull();
      expect(result.result?.fullKey).toMatch(/^ak_/);
      expect(result.result?.keyInfo.name).toBe('Test Key');
    });

    it('should reject empty name', async () => {
      const db = createMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createApiKey(db as any, 'org-1', '', ['read:transactions']);

      expect(result.error).toBe('Name is required');
      expect(result.result).toBeNull();
    });

    it('should reject whitespace-only name', async () => {
      const db = createMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createApiKey(db as any, 'org-1', '   ', ['read:transactions']);

      expect(result.error).toBe('Name is required');
    });

    it('should reject name exceeding 100 characters', async () => {
      const db = createMockDb();
      const longName = 'a'.repeat(101);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createApiKey(db as any, 'org-1', longName, ['read:transactions']);

      expect(result.error).toBe('Name must be 100 characters or less');
    });

    it('should reject invalid permissions', async () => {
      const db = createMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createApiKey(db as any, 'org-1', 'Key', ['invalid:permission']);

      expect(result.error).toBe('At least one valid permission is required');
    });

    it('should filter out invalid permissions and keep valid ones', async () => {
      const db = createMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createApiKey(db as any, 'org-1', 'Key', ['read:transactions', 'invalid:perm']);

      expect(result.error).toBeNull();
      expect(result.result).not.toBeNull();
    });

    it('should handle DB insert error', async () => {
      const db = createMockDb({ insertError: { message: 'Insert failed' } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createApiKey(db as any, 'org-1', 'Key', ['read:transactions']);

      expect(result.error).toBe('Failed to create API key');
    });
  });

  describe('revokeApiKey', () => {
    it('should deactivate an API key', async () => {
      const db = createMockDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await revokeApiKey(db as any, 'org-1', 'key-1');

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should return error on DB failure', async () => {
      const db = createMockDb({ updateError: { message: 'DB error' } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await revokeApiKey(db as any, 'org-1', 'key-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to revoke API key');
    });
  });

  describe('getApiKeyUsageStats', () => {
    it('should return error when key not found', async () => {
      const db = createMockDb({ selectData: [] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getApiKeyUsageStats(db as any, 'org-1', 'key-999');

      expect(result.stats).toBeNull();
      expect(result.error).toBe('API key not found');
    });
  });
});
