import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';

// ============================================
// Module mocks — must be declared before imports
// ============================================

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
const mockSendSlackConfirmation = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/audit', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/channels/slack', async () => {
  const actual = await vi.importActual<typeof import('@/lib/channels/slack')>('@/lib/channels/slack');
  return {
    ...actual,
    sendSlackConfirmation: (...args: unknown[]) => mockSendSlackConfirmation(...args),
    // Keep the real verifySlackSignature and parseSlackInteraction
  };
});

import { POST } from '../route';
import { createAdminClient } from '@/lib/supabase/admin';

// ============================================
// Helpers
// ============================================

const SIGNING_SECRET = 'test_signing_secret_1234567890';

function makeSlackSignature(body: string, timestamp: string): string {
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', SIGNING_SECRET);
  hmac.update(baseString);
  return `v0=${hmac.digest('hex')}`;
}

function makeTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

function makePayloadBody(actionValue: object, teamId: string = 'T12345'): string {
  const payload = JSON.stringify({
    type: 'block_actions',
    team: { id: teamId },
    user: { id: 'U12345', name: 'testuser' },
    channel: { id: 'C12345' },
    message: { ts: '1234567890.123456' },
    actions: [
      {
        action_id: 'accept_category',
        value: JSON.stringify(actionValue),
      },
    ],
  });
  return `payload=${encodeURIComponent(payload)}`;
}

function makeRequest(body: string, timestamp: string, signature: string): Request {
  return new Request('https://app.autokkeep.com/api/channels/slack/interact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': signature,
    },
    body,
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function createMockDb(opts: {
  transaction?: { entity_id: string } | null;
  hasSlackConnection?: boolean;
}) {
  const { transaction = null, hasSlackConnection = true } = opts;

  const mock: any = {
    from: vi.fn((table: string) => {
      const chain: any = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.neq = vi.fn().mockReturnValue(chain);
      chain.in = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockImplementation(() => {
        if (table === 'transactions') {
          return { data: transaction, error: null };
        }
        return { data: null, error: null };
      });
      chain.update = vi.fn().mockImplementation(() => {
        const updateChain: any = {};
        updateChain.eq = vi.fn().mockReturnValue(updateChain);
        updateChain.then = (resolve: any) => resolve({ error: null });
        return updateChain;
      });

      if (table === 'channel_connections') {
        chain.then = (resolve: any) =>
          resolve({
            data: hasSlackConnection ? [{ id: 'conn-1' }] : [],
            error: null,
          });
      }

      return chain;
    }),
  };

  return mock;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// Tests
// ============================================

describe('POST /api/channels/slack/interact — Entity Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
  });

  it('returns 200 with valid signature and valid transaction', async () => {
    const actionValue = {
      transactionId: 'tx-valid-1',
      glCode: '6200',
      glName: 'Software',
      action: 'accept',
    };
    const body = makePayloadBody(actionValue);
    const timestamp = makeTimestamp();
    const signature = makeSlackSignature(body, timestamp);

    const db = createMockDb({
      transaction: { entity_id: 'entity-1' },
      hasSlackConnection: true,
    });
    vi.mocked(createAdminClient).mockReturnValue(db);

    const req = makeRequest(body, timestamp, signature);
    const response = await POST(req as unknown as NextRequest);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  it('returns 401 with invalid Slack signature', async () => {
    const actionValue = {
      transactionId: 'tx-1',
      action: 'accept',
      glCode: '6200',
    };
    const body = makePayloadBody(actionValue);
    const timestamp = makeTimestamp();
    const invalidSignature = 'v0=invalid_signature_that_is_definitely_wrong_ab';

    const req = makeRequest(body, timestamp, invalidSignature);
    const response = await POST(req as unknown as NextRequest);

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toContain('Invalid signature');
  });

  it('returns 403 when transactionId does not exist', async () => {
    const actionValue = {
      transactionId: 'tx-nonexistent',
      glCode: '6200',
      action: 'accept',
    };
    const body = makePayloadBody(actionValue);
    const timestamp = makeTimestamp();
    const signature = makeSlackSignature(body, timestamp);

    const db = createMockDb({
      transaction: null, // Transaction not found
      hasSlackConnection: true,
    });
    vi.mocked(createAdminClient).mockReturnValue(db);

    const req = makeRequest(body, timestamp, signature);
    const response = await POST(req as unknown as NextRequest);

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toContain('not found');
  });

  it('returns 403 when transaction entity has no Slack connection', async () => {
    const actionValue = {
      transactionId: 'tx-other-entity',
      glCode: '6200',
      action: 'accept',
    };
    const body = makePayloadBody(actionValue, 'T-attacker');
    const timestamp = makeTimestamp();
    const signature = makeSlackSignature(body, timestamp);

    const db = createMockDb({
      transaction: { entity_id: 'entity-different' },
      hasSlackConnection: false, // No Slack connection for this entity
    });
    vi.mocked(createAdminClient).mockReturnValue(db);

    const req = makeRequest(body, timestamp, signature);
    const response = await POST(req as unknown as NextRequest);

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toContain('not found');
  });
});
