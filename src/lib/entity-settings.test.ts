import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGLCode, getEntitySetting, setEntitySetting } from './entity-settings';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ── Supabase mock helpers ────────────────────────────────────────────────────

function createSingleChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

const mockDb = {
  from: vi.fn(),
  storage: { from: vi.fn() },
  rpc: vi.fn(),
  auth: {},
};

const db = mockDb as unknown as SupabaseQueryClient;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('entity-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getGLCode ────────────────────────────────────────────────────────────

  describe('getGLCode', () => {
    it('returns the string value from entity_settings when present', async () => {
      const chain = createSingleChainMock({ data: { value: '4200' } });
      mockDb.from.mockReturnValue(chain);

      const result = await getGLCode(db, 'entity-1', 'cash_gl');

      expect(result).toBe('4200');
      expect(mockDb.from).toHaveBeenCalledWith('entity_settings');
      expect(chain.eq).toHaveBeenCalledWith('entity_id', 'entity-1');
      expect(chain.eq).toHaveBeenCalledWith('key', 'gl_code:cash_gl');
    });

    it('extracts code from JSONB value object', async () => {
      const chain = createSingleChainMock({ data: { value: { code: '5100' } } });
      mockDb.from.mockReturnValue(chain);

      const result = await getGLCode(db, 'entity-1', 'suspense_gl');

      expect(result).toBe('5100');
    });

    it('returns default "1010" for cash_gl when no setting exists', async () => {
      // Simulate .single() throwing (no row)
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockReturnValue(chain);
      chain.then = vi.fn((_resolve: unknown, reject: (e: Error) => void) =>
        reject(new Error('PGRST116: not found'))
      );
      mockDb.from.mockReturnValue(chain);

      const result = await getGLCode(db, 'entity-1', 'cash_gl');

      expect(result).toBe('1010');
    });

    it('returns default "2900" for suspense_gl when data is null', async () => {
      const chain = createSingleChainMock({ data: null });
      mockDb.from.mockReturnValue(chain);

      const result = await getGLCode(db, 'entity-1', 'suspense_gl');

      expect(result).toBe('2900');
    });

    it('returns default "6510" for default_expense_gl on DB error', async () => {
      const chain = createSingleChainMock({ data: null, error: { message: 'DB error' } });
      mockDb.from.mockReturnValue(chain);

      const result = await getGLCode(db, 'entity-1', 'default_expense_gl');

      expect(result).toBe('6510');
    });

    it('returns default "6180" for bank_fees_gl', async () => {
      const chain = createSingleChainMock({ data: { value: null } });
      mockDb.from.mockReturnValue(chain);

      const result = await getGLCode(db, 'entity-1', 'bank_fees_gl');

      expect(result).toBe('6180');
    });

    it('falls back to "6510" when key is not in GL_DEFAULTS', async () => {
      const chain = createSingleChainMock({ data: null });
      mockDb.from.mockReturnValue(chain);

      // Force the fallback path for an unknown key via type assertion
      const result = await getGLCode(
        db,
        'entity-1',
        'nonexistent_key' as keyof { cash_gl: string }
      );

      expect(result).toBe('6510');
    });
  });

  // ── getEntitySetting ─────────────────────────────────────────────────────

  describe('getEntitySetting', () => {
    it('returns the stored value when present', async () => {
      const chain = createSingleChainMock({ data: { value: { theme: 'dark' } } });
      mockDb.from.mockReturnValue(chain);

      const result = await getEntitySetting(db, 'entity-1', 'ui_theme', { theme: 'light' });

      expect(result).toEqual({ theme: 'dark' });
    });

    it('returns the fallback when value is null', async () => {
      const chain = createSingleChainMock({ data: { value: null } });
      mockDb.from.mockReturnValue(chain);

      const result = await getEntitySetting(db, 'entity-1', 'missing_key', 'default-value');

      expect(result).toBe('default-value');
    });

    it('returns the fallback when data is null', async () => {
      const chain = createSingleChainMock({ data: null });
      mockDb.from.mockReturnValue(chain);

      const result = await getEntitySetting(db, 'entity-1', 'any', 42);

      expect(result).toBe(42);
    });

    it('returns the fallback on query error', async () => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockReturnValue(chain);
      chain.then = vi.fn((_resolve: unknown, reject: (e: Error) => void) =>
        reject(new Error('timeout'))
      );
      mockDb.from.mockReturnValue(chain);

      const result = await getEntitySetting(db, 'entity-1', 'key', 'fallback');

      expect(result).toBe('fallback');
    });

    it('returns falsy values (0, false, empty string) when stored', async () => {
      const chain0 = createSingleChainMock({ data: { value: 0 } });
      mockDb.from.mockReturnValue(chain0);
      expect(await getEntitySetting(db, 'e', 'k', 99)).toBe(0);

      const chainFalse = createSingleChainMock({ data: { value: false } });
      mockDb.from.mockReturnValue(chainFalse);
      expect(await getEntitySetting(db, 'e', 'k', true)).toBe(false);

      const chainEmpty = createSingleChainMock({ data: { value: '' } });
      mockDb.from.mockReturnValue(chainEmpty);
      expect(await getEntitySetting(db, 'e', 'k', 'default')).toBe('');
    });
  });

  // ── setEntitySetting ─────────────────────────────────────────────────────

  describe('setEntitySetting', () => {
    it('calls upsert with the correct payload', async () => {
      const chain = createSingleChainMock({ data: null });
      mockDb.from.mockReturnValue(chain);

      await setEntitySetting(db, 'entity-1', 'my_key', { enabled: true });

      expect(mockDb.from).toHaveBeenCalledWith('entity_settings');
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_id: 'entity-1',
          key: 'my_key',
          value: { enabled: true },
        }),
        { onConflict: 'entity_id,key' }
      );
    });

    it('includes an updated_at ISO timestamp', async () => {
      const chain = createSingleChainMock({ data: null });
      mockDb.from.mockReturnValue(chain);

      await setEntitySetting(db, 'entity-1', 'key', 'val');

      const upsertArg = chain.upsert.mock.calls[0][0];
      expect(upsertArg.updated_at).toBeDefined();
      // Should be a valid ISO string
      expect(new Date(upsertArg.updated_at).toISOString()).toBe(upsertArg.updated_at);
    });
  });
});
