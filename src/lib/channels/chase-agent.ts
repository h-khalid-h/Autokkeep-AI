// ============================================
// INTELLIGENT RECEIPT CHASE AGENT
// Smart scheduling, batch processing, escalation
// ============================================

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import {
  dispatchReceiptRequest,
  type ChannelConnection,
  type ChannelType,
  type TransactionContext,
  type DispatchResult,
} from './dispatcher';
import { formatCurrency } from '@/lib/currency/converter';
import { sendSMS, sendWhatsApp } from './twilio';
import { writeAuditLog } from '@/lib/audit';

// Module-level idempotency guard (E9)
let lastRunTimestamp = 0;
const MIN_RUN_INTERVAL_MS = 60_000; // 1 minute between runs

// ============================================
// Configuration
// ============================================

export interface ChaseConfig {
  /** Minimum hours between chase attempts for the same transaction */
  minHoursBetweenChases: number;
  /** Maximum number of chase attempts per transaction */
  maxChaseAttempts: number;
  /** Minimum days since transaction date before first chase */
  minDaysBeforeChase: number;
  /** Whether to skip weekends (Saturday/Sunday) */
  skipWeekends: boolean;
  /** Timezone for weekend checks (IANA format) */
  timezone: string;
}

const DEFAULT_CONFIG: ChaseConfig = {
  minHoursBetweenChases: 24,
  maxChaseAttempts: 3,
  minDaysBeforeChase: 3,
  skipWeekends: true,
  timezone: 'America/New_York',
};

/**
 * Attempt to resolve a card_holder name to a team_member user_id.
 * This is best-effort fuzzy matching: if the card_holder text matches
 * a team member's invited_email or display name, we can associate it.
 * Returns the user_id if found, null otherwise.
 */
async function resolveCardHolderToTeamMember(
  supabase: SupabaseQueryClient,
  entityId: string,
  cardHolderName: string
): Promise<string | null> {
  if (!cardHolderName || cardHolderName === 'Unknown') return null;

  // Look up the entity's org to find team members
  const { data: entity } = await supabase
    .from('entities')
    .select('org_id')
    .eq('id', entityId)
    .single();
  if (!entity) return null;

  const { data: members } = await supabase
    .from('team_members')
    .select('user_id, invited_email')
    .eq('org_id', entity.org_id);
  if (!members?.length) return null;

  // Normalize the card holder name for fuzzy comparison
  const normalizedName = cardHolderName.toLowerCase().trim();

  for (const member of members) {
    // Match against email prefix (e.g., "john.doe@company.com" → "john.doe")
    if (member.invited_email) {
      const emailPrefix = member.invited_email.split('@')[0].toLowerCase().replace(/[._]/g, ' ');
      if (normalizedName.includes(emailPrefix) || emailPrefix.includes(normalizedName)) {
        return member.user_id;
      }
    }
  }

  return null;
}

// ============================================
// Types
// ============================================

export type EscalationLevel = 'standard' | 'urgent' | 'final';

export interface ChaseReport {
  entityId: string;
  totalChased: number;
  byChannel: Record<string, number>;
  skipped: number;
  errors: string[];
  timestamp: string;
}

interface OutstandingTransaction {
  id: string;
  merchant_name: string | null;
  merchant_raw: string | null;
  amount: string;
  date: string;
  card_last4: string | null;
  card_holder: string | null;
  entity_id: string;
  category_ai: string | null;
  category_human: string | null;
  confidence: string | null;
  currency: string | null;
  created_at: string;
}

interface PriorChaseAttempt {
  id: string;
  transaction_id: string;
  channel_type: string;
  status: string;
  sent_at: string;
}

interface CardholderGroup {
  cardHolder: string;
  resolvedUserId: string | null; // G1: team_member user_id if resolved from card_holder name
  phoneNumber: string | null;
  channelType: ChannelType;
  channelId: string;
  transactions: OutstandingTransaction[];
  chaseCount: number;
  escalationLevel: EscalationLevel;
}

// ============================================
// Escalation Logic
// ============================================

/**
 * Determines the escalation level based on number of prior chase attempts.
 * - 0 prior chases → standard (friendly first request)
 * - 1 prior chase → urgent (firm reminder)
 * - 2+ prior chases → final (compliance notice)
 */
export function getEscalationLevel(chaseCount: number): EscalationLevel {
  if (chaseCount === 0) return 'standard';
  if (chaseCount === 1) return 'urgent';
  return 'final';
}

/**
 * Determines the preferred channel for a given escalation level.
 * - Standard: SMS/WhatsApp (quick, low-friction)
 * - Urgent: Email if available, fallback to SMS/WhatsApp
 * - Final: Slack with urgency flag for manager visibility
 */
export function getEscalationChannel(
  level: EscalationLevel,
  availableChannels: ChannelConnection[]
): ChannelConnection | null {
  const channelMap = new Map<ChannelType, ChannelConnection>();
  for (const conn of availableChannels) {
    channelMap.set(conn.channelType, conn);
  }

  switch (level) {
    case 'standard':
      // Prefer WhatsApp > SMS for richer messaging
      return channelMap.get('whatsapp') || channelMap.get('sms') || channelMap.get('slack') || null;
    case 'urgent':
      // Prefer Slack for visibility, fallback to WhatsApp/SMS
      return channelMap.get('slack') || channelMap.get('whatsapp') || channelMap.get('sms') || null;
    case 'final':
      // Always use Slack for final notices (manager visibility)
      return channelMap.get('slack') || channelMap.get('whatsapp') || channelMap.get('sms') || null;
  }
}

// ============================================
// Message Templates
// ============================================

export function buildChaseMessage(
  transactions: OutstandingTransaction[],
  cardHolder: string,
  level: EscalationLevel
): string {
  const txnList = transactions
    .map((tx) => {
      const merchant = tx.merchant_name || tx.merchant_raw || 'Unknown';
      const amount = formatCurrency(parseFloat(tx.amount), tx.currency || 'USD');
      return `  • ${merchant} — ${amount} on ${tx.date}`;
    })
    .join('\n');

  const txnCountLabel = transactions.length === 1
    ? '1 transaction'
    : `${transactions.length} transactions`;

  switch (level) {
    case 'standard':
      return [
        `👋 Hi ${cardHolder}!`,
        ``,
        `We need receipts for ${txnCountLabel}:`,
        ``,
        txnList,
        ``,
        `📸 Reply with a photo of the receipt, or:`,
        `  "business" — mark as business expense`,
        `  "personal" — mark as personal`,
        ``,
        `— Autokkeep`,
      ].join('\n');

    case 'urgent':
      return [
        `⚠️ Reminder: ${cardHolder},`,
        ``,
        `Receipts are still needed for ${txnCountLabel}:`,
        ``,
        txnList,
        ``,
        `This is the 2nd request. Please respond to stay compliant.`,
        `📸 Reply with a photo or type "business"/"personal".`,
        ``,
        `— Autokkeep`,
      ].join('\n');

    case 'final':
      return [
        `🚨 FINAL NOTICE: ${cardHolder}`,
        ``,
        `Receipts are required for compliance for ${txnCountLabel}:`,
        ``,
        txnList,
        ``,
        `This is the final request. Failure to provide receipts may result in the expense being flagged.`,
        `📸 Please respond ASAP with receipt photos.`,
        ``,
        `— Autokkeep Compliance`,
      ].join('\n');
  }
}

// ============================================
// Scheduling Logic
// ============================================

/**
 * Checks whether a chase attempt is allowed right now.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function shouldChaseNow(
  lastChaseAt: string | null,
  chaseCount: number,
  transactionDate: string,
  config: ChaseConfig = DEFAULT_CONFIG
): { allowed: boolean; reason?: string } {
  const now = new Date();

  // Check weekend restriction
  if (config.skipWeekends) {
    const dayOfWeek = getDayOfWeekInTimezone(now, config.timezone);
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { allowed: false, reason: 'Weekend — chases disabled' };
    }
  }

  // Check max chase attempts
  if (chaseCount >= config.maxChaseAttempts) {
    return { allowed: false, reason: `Max chase attempts reached (${config.maxChaseAttempts})` };
  }

  // Check minimum time since last chase
  if (lastChaseAt) {
    const lastChaseDate = new Date(lastChaseAt);
    const hoursSinceLastChase = (now.getTime() - lastChaseDate.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastChase < config.minHoursBetweenChases) {
      return {
        allowed: false,
        reason: `Only ${Math.round(hoursSinceLastChase)}h since last chase (min: ${config.minHoursBetweenChases}h)`,
      };
    }
  }

  // Check minimum days since transaction
  const txDate = new Date(transactionDate);
  const daysSinceTransaction = (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceTransaction < config.minDaysBeforeChase) {
    return {
      allowed: false,
      reason: `Transaction too recent (${Math.round(daysSinceTransaction)}d, min: ${config.minDaysBeforeChase}d)`,
    };
  }

  return { allowed: true };
}

/**
 * Get the day of week (0=Sunday..6=Saturday) in a given timezone.
 */
function getDayOfWeekInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });

  const dayStr = formatter.format(date);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return dayMap[dayStr] ?? date.getDay();
}

// ============================================
// Main Chase Engine
// ============================================

/**
 * Runs the receipt chase agent for a given entity.
 *
 * 1. Queries transactions with missing receipts (document_status = 'missing', status = 'approved')
 * 2. Checks receipt_requests table for prior chase attempts
 * 3. Groups by cardholder for batch messaging
 * 4. Sends chase messages with escalation
 * 5. Records chase attempts
 * 6. Returns a chase report
 */
export async function runReceiptChase(
  entityId: string,
  supabase: SupabaseQueryClient,
  config: ChaseConfig = DEFAULT_CONFIG
): Promise<ChaseReport> {
  // E9: Idempotency guard — skip if another run started within the last 60s
  const now = Date.now();
  if (now - lastRunTimestamp < MIN_RUN_INTERVAL_MS) {
    console.info('[Chase Agent] Skipping — another run started within the last 60s');
    return { entityId, totalChased: 0, byChannel: {}, skipped: 0, errors: [], timestamp: new Date().toISOString() };
  }
  lastRunTimestamp = now;

  const report: ChaseReport = {
    entityId,
    totalChased: 0,
    byChannel: {},
    skipped: 0,
    errors: [],
    timestamp: new Date().toISOString(),
  };

  try {
    // ── Step 1: Get outstanding transactions ────────────────────────────
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select(
        'id, merchant_name, merchant_raw, amount, date, card_last4, card_holder, entity_id, category_ai, category_human, confidence, currency, created_at'
      )
      .eq('entity_id', entityId)
      .eq('document_status', 'missing')
      .eq('status', 'approved')
      .order('date', { ascending: true })
      .limit(200);

    if (txError) {
      report.errors.push(`Failed to query transactions: ${txError.message}`);
      return report;
    }

    if (!transactions || transactions.length === 0) {
      return report;
    }

    // ── Step 2: Get prior chase attempts for these transactions ──────────
    const transactionIds = transactions.map((tx: OutstandingTransaction) => tx.id);

    const { data: priorChases, error: chaseError } = await supabase
      .from('receipt_requests')
      .select('id, transaction_id, channel_type, status, sent_at')
      .in('transaction_id', transactionIds)
      .in('status', ['sent', 'responded']);

    if (chaseError) {
      report.errors.push(`Failed to query chase history: ${chaseError.message}`);
      return report;
    }

    // Build a map of transaction_id → chase attempts
    const chaseMap = new Map<string, PriorChaseAttempt[]>();
    if (priorChases) {
      for (const chase of priorChases as PriorChaseAttempt[]) {
        const existing = chaseMap.get(chase.transaction_id) || [];
        existing.push(chase);
        chaseMap.set(chase.transaction_id, existing);
      }
    }

    // ── Step 3: Check opt-out flags ─────────────────────────────────────
    const { data: optedOutUsers } = await supabase
      .from('chase_opt_outs')
      .select('phone_number')
      .eq('entity_id', entityId)
      .eq('opted_out', true);

    const optedOutPhones = new Set(
      (optedOutUsers || []).map((u: { phone_number: string }) => u.phone_number)
    );

    // ── Step 4: Get channel connections for this entity ──────────────────
    const { data: channels, error: channelError } = await supabase
      .from('channel_connections')
      .select('channel_type, channel_id, access_token, webhook_url')
      .eq('entity_id', entityId)
      .eq('is_active', true);

    if (channelError || !channels || channels.length === 0) {
      report.errors.push('No active channel connections found');
      return report;
    }

    const availableConnections: ChannelConnection[] = channels.map(
      (ch: Record<string, unknown>) => ({
        channelType: ch.channel_type as ChannelType,
        channelId: ch.channel_id as string,
        accessToken: ch.access_token as string | undefined,
        webhookUrl: ch.webhook_url as string | undefined,
      })
    );

    // ── Step 5: Filter and group transactions by cardholder ──────────────
    const cardholderGroups = new Map<string, CardholderGroup>();

    for (const tx of transactions as OutstandingTransaction[]) {
      const cardHolder = tx.card_holder || 'Unknown';

      // G1 improvement: attempt to resolve card_holder name to a team member
      // This is best-effort — if no match, we still chase with the text name
      const resolvedUserId = await resolveCardHolderToTeamMember(
        supabase, entityId, cardHolder
      );
      const priorAttempts = chaseMap.get(tx.id) || [];
      const sentAttempts = priorAttempts.filter((a) => a.status === 'sent');
      const chaseCount = sentAttempts.length;

      // Check if already responded
      const hasResponded = priorAttempts.some((a) => a.status === 'responded');
      if (hasResponded) {
        report.skipped++;
        continue;
      }

      // Get most recent chase attempt
      const lastChase = sentAttempts.length > 0
        ? sentAttempts.sort(
            (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
          )[0]
        : null;

      // Check scheduling constraints
      const scheduleCheck = shouldChaseNow(
        lastChase?.sent_at || null,
        chaseCount,
        tx.date,
        config
      );

      if (!scheduleCheck.allowed) {
        report.skipped++;
        continue;
      }

      // Check opt-out
      if (tx.card_last4 && optedOutPhones.size > 0) {
        // We'll check opt-out by matching against channel connections below
      }

      const escalationLevel = getEscalationLevel(chaseCount);

      // Group by cardholder
      const existingGroup = cardholderGroups.get(cardHolder);
      if (existingGroup) {
        existingGroup.transactions.push(tx);
        // Use the highest escalation level in the group
        if (
          getEscalationPriority(escalationLevel) >
          getEscalationPriority(existingGroup.escalationLevel)
        ) {
          existingGroup.escalationLevel = escalationLevel;
          existingGroup.chaseCount = chaseCount;
        }
      } else {
        // Select the best channel for this escalation level
        const targetChannel = getEscalationChannel(escalationLevel, availableConnections);
        if (!targetChannel) {
          // G7 improvement: explicitly record 'unresolved' chase instead of silently skipping
          if (cardHolder === 'Unknown') {
            await supabase.from('receipt_requests').insert({
              transaction_id: tx.id,
              channel_type: 'slack', // placeholder — no channel available
              status: 'unresolved',
              sent_at: new Date().toISOString(),
              escalation_level: escalationLevel,
              chase_count: chaseCount,
            });
          }
          report.errors.push(`No suitable channel for ${cardHolder} at ${escalationLevel} level`);
          report.skipped++;
          continue;
        }

        // Check opt-out for this specific channel
        if (optedOutPhones.has(targetChannel.channelId)) {
          report.skipped++;
          continue;
        }

        cardholderGroups.set(cardHolder, {
          cardHolder,
          resolvedUserId,
          phoneNumber: targetChannel.channelId,
          channelType: targetChannel.channelType,
          channelId: targetChannel.channelId,
          transactions: [tx],
          chaseCount,
          escalationLevel,
        });
      }
    }

    // ── Step 6: TOCTOU guard — re-check transaction statuses before sending ──
    // E8: Between the initial query and now, transactions may have been resolved
    // (e.g., receipt uploaded, status changed). Re-query to avoid duplicate chases.
    const allGroupTxIds = Array.from(cardholderGroups.values()).flatMap(g => g.transactions.map(tx => tx.id));
    if (allGroupTxIds.length > 0) {
      const { data: freshStatuses } = await supabase
        .from('transactions')
        .select('id, document_status, status')
        .in('id', allGroupTxIds);

      const resolvedIds = new Set(
        (freshStatuses || [])
          .filter((tx: { id: string; document_status: string; status: string }) =>
            tx.document_status !== 'missing' || tx.status !== 'approved'
          )
          .map((tx: { id: string }) => tx.id)
      );

      if (resolvedIds.size > 0) {
        for (const group of cardholderGroups.values()) {
          group.transactions = group.transactions.filter(tx => {
            if (resolvedIds.has(tx.id)) {
              report.skipped++;
              return false;
            }
            return true;
          });
        }
        // Remove groups with no remaining transactions
        for (const [key, group] of cardholderGroups.entries()) {
          if (group.transactions.length === 0) {
            cardholderGroups.delete(key);
          }
        }
      }
    }

    // ── Step 7: Send chase messages per cardholder group ─────────────────
    for (const group of cardholderGroups.values()) {
      try {
        const result = await sendChaseForGroup(group, supabase, availableConnections);

        if (result.success) {
          report.totalChased += group.transactions.length;
          report.byChannel[group.channelType] =
            (report.byChannel[group.channelType] || 0) + group.transactions.length;
        } else {
          report.errors.push(
            `Failed to chase ${group.cardHolder} via ${group.channelType}: ${result.error}`
          );
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown chase error';
        report.errors.push(`Chase error for ${group.cardHolder}: ${errMsg}`);
      }
    }

    // ── Step 8: Audit log the chase run ─────────────────────────────────
    await writeAuditLog({
      supabase,
      entityId,
      actorId: 'system',
      actorType: 'system',
      action: 'sync',
      targetType: 'receipt_chase',
      details: {
        totalChased: report.totalChased,
        skipped: report.skipped,
        byChannel: report.byChannel,
        errorCount: report.errors.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error in chase agent';
    report.errors.push(message);
    console.error(`[Chase Agent] Error for entity ${entityId}:`, error);
  }

  return report;
}

// ============================================
// Send Chase for a Cardholder Group
// ============================================

async function sendChaseForGroup(
  group: CardholderGroup,
  supabase: SupabaseQueryClient,
  availableConnections: ChannelConnection[]
): Promise<{ success: boolean; error?: string }> {
  const message = buildChaseMessage(
    group.transactions,
    group.cardHolder,
    group.escalationLevel
  );

  let result: DispatchResult;

  // For single-transaction groups, use the dispatcher for richer formatting
  if (group.transactions.length === 1) {
    const tx = group.transactions[0];
    const context: TransactionContext = {
      transactionId: tx.id,
      merchantName: tx.merchant_name || tx.merchant_raw || 'Unknown',
      amount: parseFloat(tx.amount),
      date: tx.date,
      cardLast4: tx.card_last4 || '0000',
      cardHolder: tx.card_holder || 'Team Member',
      suggestedCategory: tx.category_ai || undefined,
      suggestedGLCode: tx.category_human || tx.category_ai || undefined,
      confidence: tx.confidence ? parseFloat(tx.confidence) : undefined,
      currency: tx.currency || undefined,
    };

    const targetConnection = getEscalationChannel(group.escalationLevel, availableConnections);
    if (!targetConnection) {
      return { success: false, error: 'No channel available' };
    }

    result = await dispatchReceiptRequest(targetConnection, context);
  } else {
    // For multi-transaction batch messages, send plain text via the channel
    const targetConnection = getEscalationChannel(group.escalationLevel, availableConnections);
    if (!targetConnection) {
      return { success: false, error: 'No channel available' };
    }

    result = await sendBatchMessage(targetConnection, message);
  }

  // Record chase attempts for all transactions in the group
  const now = new Date().toISOString();
  for (const tx of group.transactions) {
    try {
      await supabase.from('receipt_requests').insert({
        transaction_id: tx.id,
        channel_type: group.channelType,
        channel_user_id: group.channelId,
        message_id: result.messageId || '',
        status: result.success ? 'sent' : 'failed',
        sent_at: now,
        escalation_level: group.escalationLevel,
        chase_count: group.chaseCount + 1,
      });
    } catch (insertErr) {
      console.error(`[Chase Agent] Failed to record chase for ${tx.id}:`, insertErr);
    }
  }

  return {
    success: result.success,
    error: result.error,
  };
}

// ============================================
// Batch Message Sender
// ============================================

async function sendBatchMessage(
  connection: ChannelConnection,
  message: string
): Promise<DispatchResult> {
  try {
    switch (connection.channelType) {
      case 'sms': {
        const smsResult = await sendSMS({
          to: connection.channelId,
          message,
        });
        return {
          success: true,
          channel: 'sms',
          messageId: smsResult.sid,
        };
      }

      case 'whatsapp': {
        const waResult = await sendWhatsApp({
          to: connection.channelId,
          message,
        });
        return {
          success: true,
          channel: 'whatsapp',
          messageId: waResult.sid,
        };
      }

      case 'slack': {
        const { getSlackClient } = await import('./slack');
        const client = getSlackClient(connection.accessToken);
        const slackResult = await client.chat.postMessage({
          channel: connection.channelId,
          text: message,
          unfurl_links: false,
        });
        return {
          success: slackResult.ok ?? false,
          channel: 'slack',
          messageId: slackResult.ts,
        };
      }

      case 'teams': {
        const { sendTeamsMessage } = await import('./teams');
        if (!connection.webhookUrl) {
          return { success: false, channel: 'teams', error: 'No Teams webhook URL' };
        }
        // Send as plain text adaptive card
        const teamsResult = await sendTeamsMessage(connection.webhookUrl, {
          transactionId: 'batch',
          merchantName: 'Multiple Transactions',
          amount: 0,
          date: new Date().toISOString().split('T')[0],
          cardLast4: '0000',
          cardHolder: 'Team',
        });
        return {
          success: teamsResult.ok,
          channel: 'teams',
          error: teamsResult.error,
        };
      }

      default:
        return {
          success: false,
          channel: connection.channelType,
          error: `Unsupported channel: ${connection.channelType}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      channel: connection.channelType,
      error: error instanceof Error ? error.message : 'Batch message failed',
    };
  }
}

// ============================================
// Helpers
// ============================================

function getEscalationPriority(level: EscalationLevel): number {
  switch (level) {
    case 'standard':
      return 0;
    case 'urgent':
      return 1;
    case 'final':
      return 2;
  }
}
