/**
 * API Input Validation Utilities
 *
 * Shared Zod schemas and helper for consistent request validation.
 * Usage:
 *
 * ```ts
 * import { parseBody, schemas } from '@/lib/validation';
 *
 * export async function POST(request: NextRequest) {
 *   const result = await parseBody(request, schemas.createEntity);
 *   if (!result.success) return result.error;
 *   const { name, currency } = result.data;
 * }
 * ```
 */

import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

// ─── Reusable Primitives ────────────────────────────────────────────────────

const uuid = z.string().uuid();
const email = z.string().email().max(320);
const nonEmptyString = z.string().min(1).max(1000);
const safeString = z.string().max(5000);
const positiveInt = z.number().int().positive();
const currency = z.enum([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'INR', 'BRL', 'MXN',
]);

// ─── Domain Schemas ─────────────────────────────────────────────────────────

export const schemas = {
  // Entity management
  createEntity: z.object({
    name: nonEmptyString,
    fiscalYearEnd: z.string().regex(/^(1[0-2]|[1-9])$/, 'Must be 1-12'),
    currency: currency.optional().default('USD'),
  }),

  // Team
  inviteTeamMember: z.object({
    email: email,
    role: z.enum(['admin', 'accountant', 'viewer']),
  }),

  claimInvite: z.object({
    token: nonEmptyString,
  }),

  // Transactions
  updateTransaction: z.object({
    status: z.enum(['pending', 'approved', 'rejected', 'human_review']).optional(),
    glCode: z.string().max(50).optional(),
    notes: safeString.optional(),
    category: z.string().max(200).optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  }),

  batchTransactions: z.object({
    action: z.enum(['approve', 'reject']),
    transactionIds: z.array(uuid).min(1).max(100),
  }),

  // Chart of Accounts
  createAccount: z.object({
    code: z.string().min(1).max(20),
    name: nonEmptyString,
    type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
    parent_code: z.string().max(20).optional().nullable(),
    description: safeString.optional(),
    is_active: z.boolean().optional().default(true),
  }),

  updateAccount: z.object({
    id: uuid,
    code: z.string().min(1).max(20).optional(),
    name: nonEmptyString.optional(),
    type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']).optional(),
    parent_code: z.string().max(20).optional().nullable(),
    description: safeString.optional(),
    is_active: z.boolean().optional(),
  }),

  // Entity assignments
  assignUser: z.object({
    userId: uuid,
  }),

  removeUser: z.object({
    userId: uuid,
  }),

  // Contact form
  contactForm: z.object({
    name: nonEmptyString,
    email: email,
    company: z.string().max(200).optional(),
    message: z.string().min(10).max(5000),
  }),

  // Notification preferences
  notificationPrefs: z.object({
    email_digest: z.boolean().optional(),
    slack_alerts: z.boolean().optional(),
    sms_urgent: z.boolean().optional(),
  }),

  // Channel preferences
  channelPrefs: z.object({
    preferred_channels: z.array(z.enum(['email', 'sms', 'slack', 'teams', 'whatsapp'])).optional(),
    quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    timezone: z.string().max(50).optional(),
  }),

  // AI categorize
  aiCategorize: z.object({
    transactionId: uuid,
    description: safeString,
    amount: z.number(),
    merchantName: z.string().max(200).optional(),
  }),

  // Approvals
  approvalAction: z.object({
    transactionId: uuid,
    action: z.enum(['approve', 'reject']),
    notes: safeString.optional(),
  }),

  // Vendor managers
  createVendorManager: z.object({
    entity_id: uuid,
    vendor_name: nonEmptyString,
    manager_email: email,
  }),

  deleteVendorManager: z.object({
    id: uuid,
  }),

  // Onboarding bootstrap
  onboardingBootstrap: z.object({
    organizationName: nonEmptyString,
    entityName: nonEmptyString,
    fiscalYearEnd: z.string().regex(/^(1[0-2]|[1-9])$/),
    currency: currency.optional().default('USD'),
    plan: z.string().max(50).optional(),
  }),
} as const;

// ─── Parse Helper ───────────────────────────────────────────────────────────

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: NextResponse };

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns a discriminated union for easy pattern matching.
 */
export async function parseBody<T extends z.ZodType>(
  request: NextRequest,
  schema: T,
): Promise<ParseResult<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      success: false,
      error: NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(i => ({
      field: i.path.join('.'),
      message: i.message,
    }));

    return {
      success: false,
      error: NextResponse.json(
        {
          error: 'Validation failed',
          details: issues,
        },
        { status: 400 },
      ),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Validate query parameters against a Zod schema.
 */
export function parseQuery<T extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: T,
): ParseResult<z.infer<T>> {
  const raw: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    raw[key] = value;
  });

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(i => ({
      field: i.path.join('.'),
      message: i.message,
    }));

    return {
      success: false,
      error: NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: issues,
        },
        { status: 400 },
      ),
    };
  }

  return { success: true, data: result.data };
}
