import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Supabase server client (dynamically imported in the route)
const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockSupabase),
}));

// Mock audit log (dynamically imported in the route)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');

describe('POST /api/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 if name is missing', async () => {
    const req = createRequest({
      email: 'test@example.com',
      message: 'Hello there',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Name');
  });

  it('should return 400 if email is missing', async () => {
    const req = createRequest({
      name: 'John Doe',
      message: 'Hello there',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('email');
  });

  it('should return 400 if email format is invalid', async () => {
    const req = createRequest({
      name: 'John Doe',
      email: 'not-a-valid-email',
      message: 'Hello there',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('email');
  });

  it('should return 400 if message is missing', async () => {
    const req = createRequest({
      name: 'John Doe',
      email: 'test@example.com',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('message');
  });

  it('should return 200 with valid payload', async () => {
    const req = createRequest({
      name: 'John Doe',
      email: 'john@example.com',
      message: 'I am interested in your product',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('should return 400 if message exceeds 5000 characters', async () => {
    const req = createRequest({
      name: 'John Doe',
      email: 'john@example.com',
      message: 'A'.repeat(5001),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('too long');
  });

  it('should accept optional fields', async () => {
    const req = createRequest({
      name: 'John Doe',
      email: 'john@example.com',
      message: 'Hello',
      company: 'Acme Corp',
      type: 'inquiry',
      entityCount: 5,
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
