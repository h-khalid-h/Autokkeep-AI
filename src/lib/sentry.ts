// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sentry Error Monitoring — Lightweight wrapper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provides a thin abstraction over Sentry so we can:
// 1. Gracefully degrade when SENTRY_DSN is not set or SDK not installed
// 2. Centralize error reporting across API routes
// 3. Add structured context to all captured exceptions
//
// HOW TO ENABLE SENTRY:
// 1. Run: npm install @sentry/nextjs
// 2. Set SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN in your .env
// 3. This wrapper will automatically detect and use the SDK

import type { NextRequest } from 'next/server';

type SeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

interface CaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id?: string; email?: string };
  level?: SeverityLevel;
}

/** Minimal shape of the Sentry SDK methods we call at runtime. */
interface SentryLike {
  withScope: (callback: (scope: SentryScope) => void) => void;
  captureException: (error: unknown) => void;
  captureMessage: (message: string) => void;
}

/** Minimal Sentry scope surface used by our wrapper. */
interface SentryScope {
  setTag: (key: string, value: string) => void;
  setExtra: (key: string, value: unknown) => void;
  setUser: (user: { id?: string; email?: string }) => void;
  setLevel: (level: string) => void;
}

// Lazy-loaded Sentry SDK reference
let _sentry: SentryLike | null = null;
let _sentryLoaded = false;

function getSentry(): SentryLike | null {
  if (_sentryLoaded) return _sentry;
  _sentryLoaded = true;

  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;

  try {
    // Use require() to avoid compile-time module resolution failures
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _sentry = require('@sentry/nextjs');
  } catch {
    // @sentry/nextjs not installed — that's OK, we'll log to console
    _sentry = null;
  }
  return _sentry;
}

/**
 * Captures an exception and logs it to Sentry if configured.
 * Falls back to console.error when SENTRY_DSN is not set or SDK not installed.
 */
export function captureException(error: unknown, context?: CaptureContext): void {
  // Always log to console
  console.error(
    '[Error]',
    error,
    context?.tags ? `tags=${JSON.stringify(context.tags)}` : ''
  );

  const Sentry = getSentry();
  if (!Sentry) return;

  try {
    Sentry.withScope((scope: SentryScope) => {
      if (context?.tags) {
        Object.entries(context.tags).forEach(([key, value]: [string, string]) =>
          scope.setTag(key, value)
        );
      }
      if (context?.extra) {
        Object.entries(context.extra).forEach(([key, value]: [string, unknown]) =>
          scope.setExtra(key, value)
        );
      }
      if (context?.user) {
        scope.setUser(context.user);
      }
      if (context?.level) {
        scope.setLevel(context.level);
      }
      Sentry.captureException(error);
    });
  } catch (sentryErr) {
    console.error('[Sentry] Failed to capture exception:', sentryErr);
  }
}

/**
 * Captures a message with structured context.
 */
export function captureMessage(message: string, context?: CaptureContext): void {
  if (context?.level === 'error' || context?.level === 'fatal') {
    console.error('[Error]', message);
  } else {
    console.warn('[Warn]', message);
  }

  const Sentry = getSentry();
  if (!Sentry) return;

  try {
    Sentry.withScope((scope: SentryScope) => {
      if (context?.tags) {
        Object.entries(context.tags).forEach(([key, value]: [string, string]) =>
          scope.setTag(key, value)
        );
      }
      if (context?.extra) {
        Object.entries(context.extra).forEach(([key, value]: [string, unknown]) =>
          scope.setExtra(key, value)
        );
      }
      if (context?.level) {
        scope.setLevel(context.level);
      }
      Sentry.captureMessage(message);
    });
  } catch {
    // Silently fail
  }
}

/**
 * Next.js route handler shape: a function that accepts a Request or NextRequest
 * and optionally a context, returning a Response.
 * Accepts NextRequest to support cron routes that use NextRequest-specific APIs.
 */
type RouteHandler = (request: NextRequest, ...rest: unknown[]) => Promise<Response>;

export function withSentryHandler<T extends RouteHandler>(
  handler: T,
  options?: { routeName?: string }
): T {
  const wrapped = async (request: NextRequest, ...rest: unknown[]) => {
    try {
      return await handler(request, ...rest);
    } catch (error) {
      captureException(error, {
        tags: { route: options?.routeName || 'unknown' },
      });
      throw error;
    }
  };
  return wrapped as T;
}

