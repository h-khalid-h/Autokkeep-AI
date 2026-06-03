/**
 * Next.js Instrumentation
 *
 * Runs once when the Node.js runtime starts (both dev and production).
 * Used for environment validation and one-time setup.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Validate environment variables on server startup
  if (process.env.NODE_ENV !== 'test') {
    const { validateEnv } = await import('@/lib/env');
    validateEnv();
  }
}
