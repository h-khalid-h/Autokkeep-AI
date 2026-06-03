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
const _positiveInt = z.number().int().positive();
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
    glName: z.string().max(200).optional(),
    notes: safeString.optional(),
    category: z.string().max(200).optional(),
    receiptUrl: z.string().url().optional(),
    receiptId: z.string().max(200).optional(),
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
    active: z.boolean().optional(),
    entityId: z.string().uuid().optional(),
  }),

  updateAccount: z.object({
    id: uuid,
    code: z.string().min(1).max(20).optional(),
    name: nonEmptyString.optional(),
    type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']).optional(),
    parent_code: z.string().max(20).optional().nullable(),
    description: safeString.optional(),
    is_active: z.boolean().optional(),
    entityId: z.string().uuid().optional(),
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
    email: z.boolean().optional(),
    slack: z.boolean().optional(),
    sms: z.boolean().optional(),
  }),

  // Channel preferences
  channelPrefs: z.object({
    entityId: z.string().min(1),
    preferredChannel: z.enum(['email', 'sms', 'slack', 'teams', 'whatsapp']),
    channelIdentifier: z.string().max(200).optional(),
  }),

  // AI categorize (POST /api/ai/categorize) — nested transaction object
  aiCategorize: z.object({
    transaction: z.object({
      id: z.string().optional(),
      merchant: z.string().min(1).max(500),
      merchantRaw: z.string().max(500).optional(),
      merchant_raw: z.string().max(500).optional(),
      amount: z.number(),
      date: z.string().min(1),
      mcc: z.string().max(20).optional(),
      currency: z.string().max(10).optional(),
      cardHolder: z.string().max(200).optional(),
      card_holder: z.string().max(200).optional(),
      bankDescription: z.string().max(500).optional(),
      rawData: z.object({
        mcc: z.string().max(20).optional(),
        currency: z.string().max(10).optional(),
        bankDescription: z.string().max(500).optional(),
      }).optional(),
    }),
    entityId: uuid,
  }),

  // Account deletion (POST /api/account/delete)
  accountDelete: z.object({
    confirmation: z.literal('DELETE'),
  }),

  // Channel dispatch (POST /api/channels/dispatch)
  channelDispatch: z.object({
    transactionId: uuid,
    entityId: uuid,
    preferredChannel: z.enum(['email', 'sms', 'slack', 'teams', 'whatsapp']).optional(),
  }),

  // Compliance check (POST /api/compliance/check)
  complianceCheck: z.object({
    entityId: uuid,
    region: z.enum(['estonia', 'qatar', 'hong_kong', 'japan', 'india', 'united_states']),
  }),

  // Health alert action (PATCH /api/insights/health)
  healthAlertAction: z.object({
    alertId: uuid,
    action: z.enum(['read', 'dismiss']),
  }),

  // Plaid link token (POST /api/plaid/link-token)
  plaidLinkToken: z.object({
    entityId: uuid,
  }),

  // Plaid reconnect (POST /api/plaid/reconnect)
  plaidReconnect: z.object({
    connectionId: uuid,
  }),

  // Team invite claim (POST /api/team/claim)
  teamClaim: z.object({
    inviteId: uuid,
  }),

  // Approvals
  approvalAction: z.object({
    transactionId: uuid,
    action: z.enum(['approve', 'reject']),
    notes: safeString.optional(),
  }),

  // Vendor managers
  createVendorManager: z.object({
    entityId: uuid,
    vendorPattern: nonEmptyString,
    managerUserId: uuid,
  }),

  deleteVendorManager: z.object({
    id: uuid,
  }),

  // Vendors
  createVendor: z.object({
    entityId: uuid,
    name: nonEmptyString,
    vendorType: z.enum(['individual', 'corporation', 'partnership', 'llc', 'nonprofit', 'government', 'unknown']).optional(),
    email: email.optional(),
    phone: z.string().max(30).optional(),
    address: safeString.optional(),
  }),

  updateVendor: z.object({
    vendorType: z.enum(['individual', 'corporation', 'partnership', 'llc', 'nonprofit', 'government', 'unknown']).optional(),
    w9Status: z.enum(['not_collected', 'requested', 'received', 'verified', 'expired']).optional(),
    email: email.optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    address: safeString.optional().nullable(),
    notes: safeString.optional().nullable(),
    isActive: z.boolean().optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  }),

  // Onboarding bootstrap
  onboardingBootstrap: z.object({
    entityName: nonEmptyString,
    entityType: z.enum(['llc', 'corp', 'sole_prop', 'partnership', 'nonprofit', 'other']).optional(),
    fiscalYearEnd: z.union([
      z.string().regex(/^(1[0-2]|[1-9])$/),
      z.number().int().min(1).max(12),
    ]).optional().default('12').transform(v => String(v)),
    currency: z.string().regex(/^[A-Z]{3}$/).optional().default('USD'),
  }),

  // User channel preferences (PUT /api/user/preferences)
  userPreferences: z.object({
    entityId: nonEmptyString,
    channel: z.enum(['sms', 'whatsapp', 'slack', 'email', 'teams']),
    identifier: nonEmptyString,
  }),

  // Billing checkout (POST /api/billing/checkout)
  checkoutSession: z.object({
    planId: nonEmptyString,
    entityCount: z.number().int().min(1).max(100).optional().default(1),
  }),

  // Transactions process (POST /api/transactions/process)
  processTransaction: z.object({
    entityId: uuid,
  }),

  // Plaid exchange (POST /api/plaid/exchange)
  plaidExchange: z.object({
    publicToken: nonEmptyString,
    entityId: uuid,
    institutionId: z.string().max(200).optional(),
    institutionName: z.string().max(200).optional(),
  }),

  // Plaid disconnect (POST /api/plaid/disconnect)
  plaidDisconnect: z.object({
    connectionId: uuid,
  }),

  // Insights narrative (POST /api/insights/narrative)
  generateNarrative: z.object({
    entityId: uuid,
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
  }),

  // Insights close (POST /api/insights/close)
  closeConversation: z.object({
    entityId: uuid,
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    action: z.literal('close'),
  }),

  // AI chat (POST /api/ai/chat)
  aiChat: z.object({
    message: z.string().min(1).max(2000),
    conversationId: uuid.optional(),
    entityId: uuid,
  }),

  // AI batch categorization (POST /api/ai/batch)
  aiBatch: z.object({
    entityId: uuid,
    transactionIds: z.array(uuid).max(500).optional(),
  }),

  // Create manual transaction (POST /api/transactions)
  createTransaction: z.object({
    entityId: uuid,
    merchant: nonEmptyString,
    amount: z.number().refine((n) => n !== 0, 'amount must not be zero'),
    date: z.string().refine(
      (d) => !isNaN(new Date(d).getTime()),
      'date must be a valid date string',
    ),
    glCode: z.string().max(50).optional(),
    glName: z.string().max(200).optional(),
    cardHolder: z.string().max(200).optional(),
    notes: safeString.optional(),
  }),

  // Ledger QuickBooks sync (POST /api/ledger/quickbooks/sync)
  ledgerSync: z.object({
    entityId: uuid,
    transactionIds: z.array(uuid).max(500).optional(),
    syncType: z.enum(['full', 'incremental']).optional().default('incremental'),
  }),

  // Ledger Xero sync (POST /api/ledger/xero/sync)
  xeroSync: z.object({
    entityId: uuid,
    syncType: z.enum(['full', 'incremental']).optional().default('incremental'),
  }),

  // Plaid sync (POST /api/plaid/sync)
  plaidSync: z.object({
    entityId: uuid,
    connectionId: uuid.optional(),
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
