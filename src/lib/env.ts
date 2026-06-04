/**
 * Environment Variable Validation
 *
 * Validates required environment variables at application startup.
 * Called from instrumentation.ts / next.config.ts to fail fast on misconfiguration.
 *
 * Variables are grouped into tiers:
 *  - CRITICAL: App will not function without these (Supabase, auth)
 *  - REQUIRED: Core features break without these (Stripe, OpenAI, Plaid)
 *  - OPTIONAL: Features degrade gracefully (Slack, SMS, Sentry)
 */

import { z } from 'zod';

// ─── Schema ─────────────────────────────────────────────────────────────────

const envSchema = z.object({
  // ── Critical: App won't start ──────────────────────────────────────────
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'Supabase anon key is too short'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'Supabase service role key is too short'),

  // ── Required: Core features ────────────────────────────────────────────
  OPENAI_API_KEY: z.string().startsWith('sk-', 'Must start with sk-'),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_', 'Must start with sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_', 'Must start with whsec_'),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET should be at least 16 characters'),
  TOKEN_ENCRYPTION_KEY: z.string().min(16, 'Token encryption key too short'),
  NEXT_PUBLIC_APP_URL: z.string().url('Must be a valid URL'),

  // ── Plaid (banking) ───────────────────────────────────────────────────
  PLAID_CLIENT_ID: z.string().min(1).optional(),
  PLAID_SECRET: z.string().min(1).optional(),
  PLAID_ENV: z.enum(['sandbox', 'development', 'production']).optional(),
  PLAID_WEBHOOK_URL: z.string().url().optional(),

  // ── Stripe pricing (optional — billing page degrades) ─────────────────
  STRIPE_PRICE_STARTER_MONTHLY: z.string().startsWith('price_').optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().startsWith('price_').optional(),
  STRIPE_PRICE_GROWTH_MONTHLY: z.string().startsWith('price_').optional(),

  // ── QuickBooks ────────────────────────────────────────────────────────
  QBO_CLIENT_ID: z.string().min(1).optional(),
  QBO_CLIENT_SECRET: z.string().min(1).optional(),
  QBO_REDIRECT_URI: z.string().url().optional(),
  QBO_ENVIRONMENT: z.enum(['sandbox', 'production']).optional(),

  // ── Xero ──────────────────────────────────────────────────────────────
  XERO_CLIENT_ID: z.string().min(1).optional(),
  XERO_CLIENT_SECRET: z.string().min(1).optional(),
  XERO_REDIRECT_URI: z.string().url().optional(),

  // ── Email (Resend) ────────────────────────────────────────────────────
  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),

  // ── Slack ─────────────────────────────────────────────────────────────
  SLACK_CLIENT_ID: z.string().min(1).optional(),
  SLACK_CLIENT_SECRET: z.string().min(1).optional(),
  SLACK_SIGNING_SECRET: z.string().min(1).optional(),
  SLACK_BOT_TOKEN: z.string().startsWith('xoxb-').optional(),

  // ── Twilio (SMS / WhatsApp) ───────────────────────────────────────────
  TWILIO_ACCOUNT_SID: z.string().startsWith('AC').optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_PHONE_NUMBER: z.string().min(1).optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().min(1).optional(),

  // ── Microsoft Teams ───────────────────────────────────────────────────
  TEAMS_WEBHOOK_URL: z.string().url().optional(),
  TEAMS_WEBHOOK_SECRET: z.string().min(1).optional(),

  // ── Observability ─────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),

  // ── Operational ───────────────────────────────────────────────────────
  ADMIN_EMAILS: z.string().min(1).optional(),
  OAUTH_STATE_SECRET: z.string().min(16).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  OCR_LOOKBACK_DAYS: z.string().regex(/^\d+$/).optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
});

export type Env = z.infer<typeof envSchema>;

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate environment variables.
 * Logs warnings for missing optional vars and throws for missing critical vars.
 *
 * @returns Parsed environment object
 * @throws {Error} If critical environment variables are missing
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues;

    // Separate critical from optional issues
    const criticalFields = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'CRON_SECRET',
      'TOKEN_ENCRYPTION_KEY',
      'NEXT_PUBLIC_APP_URL',
    ];

    const criticalIssues = issues.filter(i =>
      criticalFields.includes(String(i.path[0]))
    );
    const warningIssues = issues.filter(i =>
      !criticalFields.includes(String(i.path[0]))
    );

    // Log warnings for optional vars
    if (warningIssues.length > 0) {
      console.error(
        `[env] ⚠️  ${warningIssues.length} optional env var(s) missing or invalid:`,
        warningIssues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '),
      );
    }

    // Throw for critical vars
    if (criticalIssues.length > 0) {
      const msg = criticalIssues
        .map(i => `  • ${i.path.join('.')}: ${i.message}`)
        .join('\n');

      throw new Error(
        `[env] ❌ Missing critical environment variables:\n${msg}\n\n` +
        'The application cannot start without these. Check your .env file or deployment config.',
      );
    }
  }

  // Runtime warning: OAuth state encryption not configured for active integrations
  const parsed = (result.success ? result.data : process.env) as Record<string, string | undefined>;
  if ((parsed.QBO_CLIENT_ID || parsed.XERO_CLIENT_ID) && !parsed.OAUTH_STATE_SECRET) {
    console.warn('[Env] WARNING: OAUTH_STATE_SECRET is not set but QBO/Xero integration is configured. OAuth state will not be encrypted.');
  }

  // Return raw process.env cast (we validated it)
  return process.env as unknown as Env;
}
