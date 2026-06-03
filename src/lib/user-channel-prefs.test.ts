import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Fluent chain builder for Supabase query mocks
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);

  // Thenable
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

const mockDb = {
  from: vi.fn(),
  storage: { from: vi.fn() },
  rpc: vi.fn(),
  auth: {},
};

// ─── Import under test ──────────────────────────────────────────────────────────

import {
  getUserChannelPreference,
  setUserChannelPreference,
} from './user-channel-prefs';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const db = mockDb as unknown as SupabaseQueryClient;

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('getUserChannelPreference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns channel preference when one exists', async () => {
    const chain = createChainMock({
      data: [
        {
          id: 'pref-1',
          user_id: 'user-1',
          entity_id: 'entity-1',
          channel: 'whatsapp',
          identifier: '+1234567890',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    });
    mockDb.from.mockReturnValue(chain);

    const result = await getUserChannelPreference(db, 'user-1', 'entity-1');

    expect(result).toEqual({
      channel: 'whatsapp',
      identifier: '+1234567890',
    });
  });

  it('returns null when no preference exists', async () => {
    const chain = createChainMock({ data: [], error: null });
    mockDb.from.mockReturnValue(chain);

    const result = await getUserChannelPreference(db, 'user-1', 'entity-1');
    expect(result).toBeNull();
  });

  it('returns null when userId is empty', async () => {
    const result = await getUserChannelPreference(db, '', 'entity-1');
    expect(result).toBeNull();
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it('returns null when entityId is empty', async () => {
    const result = await getUserChannelPreference(db, 'user-1', '');
    expect(result).toBeNull();
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it('returns null on DB error', async () => {
    const chain = createChainMock({
      data: null,
      error: { message: 'connection refused' },
    });
    mockDb.from.mockReturnValue(chain);

    const result = await getUserChannelPreference(db, 'user-1', 'entity-1');
    expect(result).toBeNull();
  });
});

describe('setUserChannelPreference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts the preference successfully', async () => {
    const chain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(chain);

    await expect(
      setUserChannelPreference(db, 'user-1', 'entity-1', 'sms', '+1234567890'),
    ).resolves.toBeUndefined();

    expect(mockDb.from).toHaveBeenCalledWith('user_channel_preferences');
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        entity_id: 'entity-1',
        channel: 'sms',
        identifier: '+1234567890',
      }),
      { onConflict: 'user_id,entity_id' },
    );
  });

  it('throws on DB error', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.upsert = vi.fn().mockImplementation(() => {
      throw new Error('DB write error');
    });

    mockDb.from.mockReturnValue(chain);

    await expect(
      setUserChannelPreference(db, 'user-1', 'entity-1', 'slack', 'U12345'),
    ).rejects.toThrow('DB write error');
  });
});
