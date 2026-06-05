import { NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';

// ─── Standardized API Responses ─────────────────────────────────────────────

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

// ─── Centralized Error Handler ─────────────────────────────────────────────

/**
 * Standard error handler for API route catch blocks.
 * Logs to console, reports to Sentry with route tag, returns standardized error response.
 */
export function handleApiError(
  error: unknown,
  routeName: string,
  userMessage = 'Internal server error'
): NextResponse {
  console.error(`[${routeName}] Error:`, error);
  captureException(error, { tags: { route: routeName } });
  return apiError(userMessage, 500);
}
