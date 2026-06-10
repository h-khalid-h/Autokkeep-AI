import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted Mocks ──────────────────────────────────────────────────────────────

const { mockUpdateSession, mockRedirect, mockNext, mockIsAdminEmail } = vi.hoisted(() => {
  const mockUpdateSession = vi.fn();
  const mockRedirect = vi.fn((url: any) => ({
    type: 'redirect',
    _redirectUrl: url,
  }));
  const mockNext = vi.fn(() => ({ type: 'next', cookies: { set: vi.fn() } }));
  const mockIsAdminEmail = vi.fn((email: string) => email === 'admin@autokkeep.com');
  return { mockUpdateSession, mockRedirect, mockNext, mockIsAdminEmail };
});

vi.mock('@/lib/admin', () => ({
  isAdminEmail: mockIsAdminEmail,
}));

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    next: mockNext,
    redirect: mockRedirect,
  },
  NextRequest: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createMockRequest(pathname: string, searchParams?: Record<string, string>): any {
  const url = new URL(`http://localhost:3000${pathname}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }

  return {
    nextUrl: {
      pathname,
      searchParams: url.searchParams,
      clone: () => {
        // Return a real URL object which supports pathname assignment
        const cloned = new URL(url.toString());
        return cloned;
      },
    },
    cookies: {
      getAll: vi.fn(() => []),
      set: vi.fn(),
    },
  };
}

function createMockSupabase(membershipResult: { data: any; error?: any } = { data: { id: 'member-1' } }) {
  const mockMaybeSingle = vi.fn().mockResolvedValue(membershipResult);
  const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
  const mockEq = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

  return {
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  };
}

/** Helper to extract the pathname from the redirect call */
function getRedirectPathname(): string {
  const redirectArg = mockRedirect.mock.calls[0][0];
  if (redirectArg instanceof URL) return redirectArg.pathname;
  return redirectArg?.pathname ?? '';
}

/** Helper to extract searchParams from the redirect call */
function getRedirectSearchParam(key: string): string | null {
  const redirectArg = mockRedirect.mock.calls[0][0];
  if (redirectArg instanceof URL) return redirectArg.searchParams.get(key);
  return redirectArg?.searchParams?.get(key) ?? null;
}

// ─── Import under test (after mocks) ───────────────────────────────────────────

import { middleware } from './middleware';

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('middleware - auth routing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, ADMIN_EMAILS: 'admin@autokkeep.com' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Public Routes ──────────────────────────────────────────────────────

  describe('public routes', () => {
    it('allows unauthenticated access to root /', async () => {
      const supabaseResponse = { type: 'next' };
      mockUpdateSession.mockResolvedValue({ supabaseResponse, user: null, supabase: null });

      const req = createMockRequest('/');
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });

    it('allows unauthenticated access to /about', async () => {
      const supabaseResponse = { type: 'next' };
      mockUpdateSession.mockResolvedValue({ supabaseResponse, user: null, supabase: null });

      const req = createMockRequest('/about');
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });

    it('allows unauthenticated access to /pricing', async () => {
      const supabaseResponse = { type: 'next' };
      mockUpdateSession.mockResolvedValue({ supabaseResponse, user: null, supabase: null });

      const req = createMockRequest('/pricing');
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });

    it('allows unauthenticated access to /auth/login', async () => {
      const supabaseResponse = { type: 'next' };
      mockUpdateSession.mockResolvedValue({ supabaseResponse, user: null, supabase: null });

      const req = createMockRequest('/auth/login');
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });

    it('allows unauthenticated access to /auth/signup', async () => {
      const supabaseResponse = { type: 'next' };
      mockUpdateSession.mockResolvedValue({ supabaseResponse, user: null, supabase: null });

      const req = createMockRequest('/auth/signup');
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });
  });

  // ── Protected Routes (unauthenticated) ────────────────────────────────

  describe('protected routes - unauthenticated', () => {
    const protectedPaths = [
      '/dashboard',
      '/settings',
      '/analytics',
      '/onboarding',
      '/transactions',
      '/chart-of-accounts',
      '/account',
      '/close',
      '/health',
      '/insights',
      '/portfolio',
      '/tax',
      '/admin',
      '/vendors',
      '/reports',
      '/audit',
      '/notifications',
    ];

    for (const path of protectedPaths) {
      it(`redirects unauthenticated user from ${path} to /auth/login`, async () => {
        mockUpdateSession.mockResolvedValue({
          supabaseResponse: { type: 'next' },
          user: null,
          supabase: null,
        });

        const req = createMockRequest(path);
        await middleware(req);
        expect(mockRedirect).toHaveBeenCalled();
        expect(getRedirectPathname()).toBe('/auth/login');
      });
    }

    it('redirects unauthenticated user from nested protected route', async () => {
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: null,
        supabase: null,
      });

      const req = createMockRequest('/dashboard/overview');
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/auth/login');
    });

    it('includes redirect param with original path', async () => {
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: null,
        supabase: null,
      });

      const req = createMockRequest('/settings');
      await middleware(req);
      expect(getRedirectSearchParam('redirect')).toBe('/settings');
    });
  });

  // ── Protected Routes (authenticated with membership) ──────────────────

  describe('protected routes - authenticated with membership', () => {
    it('allows authenticated user with org membership to access /dashboard', async () => {
      const supabaseResponse = { type: 'next' };
      const mockSupabase = createMockSupabase({ data: { id: 'member-1' } });
      mockUpdateSession.mockResolvedValue({
        supabaseResponse,
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/dashboard');
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });

    it('allows authenticated user to access /settings', async () => {
      const supabaseResponse = { type: 'next' };
      const mockSupabase = createMockSupabase({ data: { id: 'member-1' } });
      mockUpdateSession.mockResolvedValue({
        supabaseResponse,
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/settings');
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });
  });

  // ── Onboarding Redirect (no membership) ───────────────────────────────

  describe('onboarding redirect - no membership', () => {
    it('redirects to /onboarding when user has no org membership', async () => {
      const mockSupabase = createMockSupabase({ data: null });
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/dashboard');
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/onboarding');
    });

    it('does NOT redirect when already on /onboarding', async () => {
      const supabaseResponse = { type: 'next' };
      const mockSupabase = createMockSupabase({ data: null });
      mockUpdateSession.mockResolvedValue({
        supabaseResponse,
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/onboarding');
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });

    it('does NOT redirect when on /onboarding/step-2', async () => {
      const supabaseResponse = { type: 'next' };
      const mockSupabase = createMockSupabase({ data: null });
      mockUpdateSession.mockResolvedValue({
        supabaseResponse,
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/onboarding/step-2');
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });
  });

  // ── Fail-Closed DB Error ──────────────────────────────────────────────

  describe('fail-closed behavior on DB errors', () => {
    it('redirects to /onboarding when membership query throws', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase.from = vi.fn(() => {
        throw new Error('DB connection failed');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/dashboard');
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/onboarding');
      consoleSpy.mockRestore();
    });

    it('logs the DB error when fail-closed triggers', async () => {
      const mockSupabase = createMockSupabase();
      mockSupabase.from = vi.fn(() => {
        throw new Error('Timeout');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/settings');
      await middleware(req);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Middleware] DB query failed'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  // ── Admin Route Protection ────────────────────────────────────────────

  describe('admin route protection', () => {
    it('allows admin users to access /admin', async () => {
      const supabaseResponse = { type: 'next' };
      const mockSupabase = createMockSupabase({ data: { id: 'member-1' } });
      mockUpdateSession.mockResolvedValue({
        supabaseResponse,
        user: { id: 'user-1', email: 'admin@autokkeep.com' },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/admin');
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });

    it('redirects non-admin users from /admin to /dashboard', async () => {
      const mockSupabase = createMockSupabase({ data: { id: 'member-1' } });
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/admin');
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/dashboard');
    });

    it('redirects non-admin users from nested /admin/users to /dashboard', async () => {
      const mockSupabase = createMockSupabase({ data: { id: 'member-1' } });
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/admin/users');
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/dashboard');
    });

    it('redirects user with no email from /admin to /dashboard', async () => {
      const mockSupabase = createMockSupabase({ data: { id: 'member-1' } });
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: { id: 'user-1', email: null },
        supabase: mockSupabase,
      });

      const req = createMockRequest('/admin');
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/dashboard');
    });
  });

  // ── Auth Route Redirect (authenticated) ───────────────────────────────

  describe('auth routes - authenticated user redirect', () => {
    it('redirects authenticated user from /auth/login to /dashboard', async () => {
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: null,
      });

      const req = createMockRequest('/auth/login');
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/dashboard');
    });

    it('redirects authenticated user from /auth/signup to /dashboard', async () => {
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: { id: 'user-1', email: 'user@example.com' },
        supabase: null,
      });

      const req = createMockRequest('/auth/signup');
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/dashboard');
    });
  });

  // ── Auth Error Interception ───────────────────────────────────────────

  describe('auth error interception', () => {
    it('redirects to /auth/error when ?error= query param is present', async () => {
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: null,
        supabase: null,
      });

      const req = createMockRequest('/', { error: 'access_denied' });
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/auth/error');
    });

    it('redirects to /auth/error when ?error_code= query param is present', async () => {
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: null,
        supabase: null,
      });

      const req = createMockRequest('/', { error_code: '401' });
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/auth/error');
    });

    it('does NOT redirect from /auth/error when error params are present', async () => {
      const supabaseResponse = { type: 'next' };
      mockUpdateSession.mockResolvedValue({
        supabaseResponse,
        user: null,
        supabase: null,
      });

      const req = createMockRequest('/auth/error', { error: 'access_denied' });
      const result = await middleware(req);
      expect(result).toBe(supabaseResponse);
    });

    it('redirects from /dashboard when error param is present (even with auth)', async () => {
      mockUpdateSession.mockResolvedValue({
        supabaseResponse: { type: 'next' },
        user: { id: 'user-1' },
        supabase: null,
      });

      const req = createMockRequest('/dashboard', { error: 'expired_link' });
      await middleware(req);
      expect(mockRedirect).toHaveBeenCalled();
      expect(getRedirectPathname()).toBe('/auth/error');
    });
  });
});
