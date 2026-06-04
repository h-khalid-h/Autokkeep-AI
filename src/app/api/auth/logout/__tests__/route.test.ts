import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockSignOut = vi.fn();
const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-123', email: 'test@example.com' } },
  error: null,
});
const mockSupabase = {
  auth: { signOut: mockSignOut, getUser: mockGetUser },
};

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockSupabase),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createPostRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sign out successfully (happy path)', async () => {
    mockSignOut.mockResolvedValue({ error: null });

    const req = createPostRequest();
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('should return 400 when signOut fails', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'Session expired' } });

    const req = createPostRequest();
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Logout failed');
  });

  it('should return 500 when an unexpected error occurs', async () => {
    mockSignOut.mockRejectedValue(new Error('Unexpected crash'));

    const req = createPostRequest();
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to sign out');
  });
});
