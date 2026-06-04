import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Reset module state for each test ────────────────────────────────────────
// The sentry module has lazy-loaded singleton state (_sentry, _sentryLoaded).
// We need to re-import the module fresh for certain tests.

// Mock the require() for @sentry/nextjs to avoid real imports
// We can't use vi.mock for require()-based dynamic imports the same way,
// so we test the no-Sentry path by ensuring SENTRY_DSN is not set.

describe('sentry wrapper', () => {
  const originalEnv = process.env;
  let captureException: typeof import('./sentry').captureException;
  let captureMessage: typeof import('./sentry').captureMessage;
  let withSentryHandler: typeof import('./sentry').withSentryHandler;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    // Ensure no Sentry DSN is set so getSentry() returns null
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    // Re-import the module fresh to reset _sentry/_sentryLoaded state
    vi.resetModules();
    const mod = await import('./sentry');
    captureException = mod.captureException;
    captureMessage = mod.captureMessage;
    withSentryHandler = mod.withSentryHandler;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── captureException ──────────────────────────────────────────────────

  describe('captureException', () => {
    it('always logs to console.error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('something broke');

      captureException(error);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Error]',
        error,
        expect.any(String)
      );
      consoleSpy.mockRestore();
    });

    it('includes tags in the console output', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      captureException(new Error('oops'), {
        tags: { route: '/api/test', module: 'billing' },
      });

      const logArgs = consoleSpy.mock.calls[0];
      expect(logArgs[2]).toContain('route');
      expect(logArgs[2]).toContain('/api/test');
      consoleSpy.mockRestore();
    });

    it('does not throw when Sentry SDK is not available', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => captureException(new Error('safe'))).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('handles non-Error objects', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => captureException('string error')).not.toThrow();
      expect(() => captureException({ code: 500 })).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('handles context with user and level', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() =>
        captureException(new Error('test'), {
          user: { id: 'user-1', email: 'a@b.com' },
          level: 'warning',
          extra: { detail: 'more info' },
        })
      ).not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  // ── captureMessage ────────────────────────────────────────────────────

  describe('captureMessage', () => {
    it('logs error-level messages to console.error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      captureMessage('critical failure', { level: 'error' });

      expect(consoleSpy).toHaveBeenCalledWith('[Error]', 'critical failure');
      consoleSpy.mockRestore();
    });

    it('logs fatal-level messages to console.error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      captureMessage('fatal problem', { level: 'fatal' });

      expect(consoleSpy).toHaveBeenCalledWith('[Error]', 'fatal problem');
      consoleSpy.mockRestore();
    });

    it('logs other levels to console.warn', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      captureMessage('just a warning', { level: 'warning' });

      expect(consoleSpy).toHaveBeenCalledWith('[Warn]', 'just a warning');
      consoleSpy.mockRestore();
    });

    it('defaults to console.warn when no level specified', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      captureMessage('info message');

      expect(consoleSpy).toHaveBeenCalledWith('[Warn]', 'info message');
      consoleSpy.mockRestore();
    });
  });

  // ── withSentryHandler ─────────────────────────────────────────────────

  describe('withSentryHandler', () => {
    it('returns the handler result on success', async () => {
      const handler = vi.fn().mockResolvedValue(
        new Response('OK', { status: 200 })
      );

      const wrapped = withSentryHandler(handler, { routeName: '/api/test' });
      const result = await wrapped();

      expect(result.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('re-throws the error on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler = vi.fn().mockRejectedValue(new Error('route crashed'));

      const wrapped = withSentryHandler(handler);

      await expect(wrapped()).rejects.toThrow('route crashed');
      consoleSpy.mockRestore();
    });

    it('calls captureException before re-throwing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('handler error');
      const handler = vi.fn().mockRejectedValue(error);

      const wrapped = withSentryHandler(handler, { routeName: '/api/broken' });

      try {
        await wrapped();
      } catch {
        // expected
      }

      // captureException logs to console.error
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Error]',
        error,
        expect.stringContaining('route')
      );
      consoleSpy.mockRestore();
    });

    it('passes through arguments to the wrapped handler', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('ok'));

      const wrapped = withSentryHandler(handler);
      const req = new Request('http://localhost/api/test');
      await wrapped(req);

      expect(handler).toHaveBeenCalledWith(req);
    });

    it('uses "unknown" route name when not specified', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler = vi.fn().mockRejectedValue(new Error('oops'));

      const wrapped = withSentryHandler(handler);

      try {
        await wrapped();
      } catch {
        // expected
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Error]',
        expect.any(Error),
        expect.stringContaining('unknown')
      );
      consoleSpy.mockRestore();
    });
  });

  // ── Graceful degradation ──────────────────────────────────────────────

  describe('graceful degradation', () => {
    it('does not crash when all Sentry functions are called without SDK', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => {
        captureException(new Error('test'));
        captureMessage('test message');
        captureMessage('error msg', { level: 'error' });
        captureException(new Error('with context'), {
          tags: { a: 'b' },
          extra: { x: 1 },
          user: { id: '1' },
          level: 'warning',
        });
      }).not.toThrow();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
