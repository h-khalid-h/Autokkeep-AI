import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Supabase server client
const mockFrom = vi.fn();

const mockUser = { id: 'user-1', email: 'test@example.com' };
const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: mockUser },
  error: null,
});

const mockSupabase = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
};

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockSupabase),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createGetRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/channel-preferences', {
    method: 'GET',
  });
}

function createPutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/channel-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET, PUT } = await import('../route');

describe('Channel Preferences API /api/account/channel-preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });
  });

  // ── GET ────────────────────────────────────────────────────────────────────

  describe('GET', () => {
    it("should return user's channel preferences", async () => {
      const rawPrefs = [
        { entity_id: 'entity-1', preferred_channel: 'slack', channel_identifier: '#general', is_active: true },
        { entity_id: 'entity-2', preferred_channel: 'email', channel_identifier: null, is_active: true },
      ];
      const chain = createChainMock({ data: rawPrefs, error: null });
      mockFrom.mockReturnValue(chain);

      const req = createGetRequest();
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([
        { entityId: 'entity-1', preferredChannel: 'slack', channelIdentifier: '#general', isActive: true },
        { entityId: 'entity-2', preferredChannel: 'email', channelIdentifier: null, isActive: true },
      ]);
    });
  });

  // ── PUT ────────────────────────────────────────────────────────────────────

  describe('PUT', () => {
    it('should upsert a channel preference for an entity', async () => {
      const savedRow = {
        entity_id: 'entity-1',
        preferred_channel: 'slack',
        channel_identifier: '#finance',
        is_active: true,
      };
      const chain = createChainMock({ data: savedRow, error: null });
      mockFrom.mockReturnValue(chain);

      const req = createPutRequest({
        entityId: 'entity-1',
        preferredChannel: 'slack',
        channelIdentifier: '#finance',
      });
      const res = await PUT(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.preferredChannel).toBe('slack');
      expect(json.channelIdentifier).toBe('#finance');
    });

    it('should validate channel type (must be slack/sms/whatsapp/email/teams)', async () => {
      const chain = createChainMock({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      // Test valid channels don't return 400
      for (const channel of ['slack', 'sms', 'whatsapp', 'email', 'teams']) {
        const savedRow = {
          entity_id: 'entity-1',
          preferred_channel: channel,
          channel_identifier: null,
          is_active: true,
        };
        const validChain = createChainMock({ data: savedRow, error: null });
        mockFrom.mockReturnValue(validChain);

        const req = createPutRequest({ entityId: 'entity-1', preferredChannel: channel });
        const res = await PUT(req);
        expect(res.status).toBe(200);
      }
    });

    it('should reject invalid channel type', async () => {
      const req = createPutRequest({
        entityId: 'entity-1',
        preferredChannel: 'pigeon',
      });
      const res = await PUT(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('preferredChannel must be one of');
    });

    it('should require entityId in body', async () => {
      const req = createPutRequest({
        preferredChannel: 'slack',
      });
      const res = await PUT(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('entityId is required');
    });
  });
});
