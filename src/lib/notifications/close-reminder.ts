// ============================================
// CLOSE REMINDER NOTIFICATION BUILDERS
// Period-close readiness alerts for Slack, SMS, and Email
// ============================================

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  elements?: Array<{
    type: string;
    text?: string;
  }>;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com';
}

function getScoreEmoji(score: number): string {
  if (score >= 80) return '🟢';
  if (score >= 60) return '🟡';
  return '🔴';
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Slack Block Kit ───────────────────────────────────────────────────────────

/**
 * Builds Slack Block Kit blocks for a period-close readiness reminder.
 *
 * @param entityName - Name of the entity
 * @param period - Accounting period (e.g., "May 2026")
 * @param score - Readiness score (0-100)
 * @param failedChecks - List of items preventing close
 * @returns Slack Block Kit blocks array
 */
export function buildCloseReminderSlackBlocks(
  entityName: string,
  period: string,
  score: number,
  failedChecks: string[]
): SlackBlock[] {
  const emoji = getScoreEmoji(score);
  const baseUrl = getBaseUrl();

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} Period Close Reminder — ${entityName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Period:*\n${period}`,
        },
        {
          type: 'mrkdwn',
          text: `*Readiness:*\n${emoji} ${score}%`,
        },
      ],
    },
  ];

  if (failedChecks.length > 0) {
    const checksList = failedChecks
      .map((check) => `• ${check}`)
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Issues to Resolve:*\n${checksList}`,
      },
    });
  }

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `<${baseUrl}/entities|Review in Autokkeep →>`,
    },
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `🤖 Autokkeep Close Reminder · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
      },
    ],
  });

  return blocks;
}

// ─── SMS Plain Text ────────────────────────────────────────────────────────────

/**
 * Builds a compact SMS message for a period-close readiness reminder.
 *
 * @param entityName - Name of the entity
 * @param period - Accounting period (e.g., "May 2026")
 * @param score - Readiness score (0-100)
 * @returns Compact SMS text
 */
export function buildCloseReminderSMS(
  entityName: string,
  period: string,
  score: number
): string {
  const baseUrl = getBaseUrl();
  const urgency = score < 60 ? '!!' : score < 80 ? '!' : '';

  const lines = [
    `${urgency}AUTOKKEEP CLOSE REMINDER${urgency}`,
    `${entityName} — ${period}`,
    `Readiness: ${score}%`,
    '',
    `Review: ${baseUrl}/entities`,
  ];

  return lines.join('\n');
}

// ─── Email HTML ────────────────────────────────────────────────────────────────

/**
 * Builds a rich HTML email for a period-close readiness reminder.
 *
 * @param entityName - Name of the entity
 * @param period - Accounting period (e.g., "May 2026")
 * @param score - Readiness score (0-100)
 * @param failedChecks - List of items preventing close
 * @returns HTML email string
 */
export function buildCloseReminderEmailHtml(
  entityName: string,
  period: string,
  score: number,
  failedChecks: string[]
): string {
  const baseUrl = getBaseUrl();
  const emoji = getScoreEmoji(score);
  const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626';

  const failedChecksHtml = failedChecks.length > 0
    ? `
      <h3 style="margin: 0 0 12px; font-size: 14px; color: #374151;">Issues to Resolve</h3>
      <ul style="margin: 0 0 20px; padding-left: 20px; font-size: 13px; color: #4b5563; line-height: 1.8;">
        ${failedChecks.map((check) => `<li>${escapeHtml(check)}</li>`).join('')}
      </ul>
    `
    : '<p style="color: #16a34a; font-size: 13px; margin: 0 0 20px;">✅ All checks passed! Ready to close.</p>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 20px 24px; color: white;">
          <h1 style="margin: 0; font-size: 18px; font-weight: 600;">${emoji} Period Close Reminder</h1>
          <p style="margin: 4px 0 0; opacity: 0.8; font-size: 13px;">${escapeHtml(entityName)} — ${escapeHtml(period)}</p>
        </div>

        <div style="padding: 24px;">
          <!-- Score Card -->
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 36px; font-weight: 700; color: ${scoreColor};">${score}%</div>
            <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Close Readiness</div>
          </div>

          <!-- Failed Checks -->
          ${failedChecksHtml}

          <!-- CTA -->
          <div style="text-align: center;">
            <a href="${baseUrl}/entities"
               style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
              Review & Resolve →
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #9ca3af;">
            Autokkeep — AI Financial Operations Platform<br>
            This is an automated reminder. Period close is not yet locked.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}
