import Twilio from 'twilio';

// ============================================
// TWILIO CLIENT (SMS + WhatsApp)
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let twilioClient: any = null;

export function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('Missing Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)');
    }

    twilioClient = Twilio(accountSid, authToken);
  }

  return twilioClient;
}

// ============================================
// SMS Functions
// ============================================

export interface SendSMSOptions {
  to: string;
  message: string;
  mediaUrl?: string;
}

export async function sendSMS({ to, message, mediaUrl }: SendSMSOptions) {
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!from) throw new Error('Missing TWILIO_PHONE_NUMBER');

  const params: Record<string, unknown> = {
    body: message,
    from,
    to,
  };

  if (mediaUrl) {
    params.mediaUrl = [mediaUrl];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await client.messages.create(params as any);

  return {
    sid: result.sid,
    status: result.status,
    to: result.to,
    dateCreated: result.dateCreated,
  };
}

// ============================================
// WhatsApp Functions
// ============================================

export interface SendWhatsAppOptions {
  to: string; // Format: whatsapp:+1234567890
  message: string;
  mediaUrl?: string;
}

export async function sendWhatsApp({ to, message, mediaUrl }: SendWhatsAppOptions) {
  const client = getTwilioClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!from) throw new Error('Missing TWILIO_WHATSAPP_NUMBER');

  // Ensure proper format
  const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  const params: Record<string, unknown> = {
    body: message,
    from,
    to: formattedTo,
  };

  if (mediaUrl) {
    params.mediaUrl = [mediaUrl];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await client.messages.create(params as any);

  return {
    sid: result.sid,
    status: result.status,
    to: result.to,
    dateCreated: result.dateCreated,
  };
}

// ============================================
// Receipt Request Templates
// ============================================

export interface ReceiptRequestContext {
  merchantName: string;
  amount: number;
  date: string;
  cardLast4: string;
  cardHolder: string;
  transactionId: string;
}

export function buildReceiptRequestMessage(context: ReceiptRequestContext): string {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(context.amount);

  return [
    `👋 Hey ${context.cardHolder}!`,
    ``,
    `Autokkeep detected a ${formattedAmount} transaction:`,
    ``,
    `📍 Merchant: ${context.merchantName}`,
    `💳 Card: ****${context.cardLast4}`,
    `📅 Date: ${context.date}`,
    ``,
    `Please reply with one of the following:`,
    ``,
    `1️⃣ "business" — This is a business expense`,
    `2️⃣ "personal" — This is personal, exclude it`,
    `3️⃣ "receipt" — I'll upload the receipt now`,
    ``,
    `Or simply send a photo of the receipt to match this transaction.`,
    ``,
    `Ref: ${context.transactionId}`,
  ].join('\n');
}

// ============================================
// Webhook Payload Parsing
// ============================================

export interface TwilioInboundMessage {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia: number;
  mediaUrls: string[];
  mediaContentTypes: string[];
  isWhatsApp: boolean;
}

export function parseTwilioWebhook(body: Record<string, string>): TwilioInboundMessage {
  const numMedia = parseInt(body.NumMedia || '0', 10);
  const mediaUrls: string[] = [];
  const mediaContentTypes: string[] = [];

  for (let i = 0; i < numMedia; i++) {
    if (body[`MediaUrl${i}`]) mediaUrls.push(body[`MediaUrl${i}`]);
    if (body[`MediaContentType${i}`]) mediaContentTypes.push(body[`MediaContentType${i}`]);
  }

  return {
    messageSid: body.MessageSid || '',
    from: body.From || '',
    to: body.To || '',
    body: body.Body || '',
    numMedia,
    mediaUrls,
    mediaContentTypes,
    isWhatsApp: (body.From || '').startsWith('whatsapp:'),
  };
}

// ============================================
// Twilio Webhook Signature Validation
// ============================================

export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  return Twilio.validateRequest(authToken, signature, url, params);
}

// ============================================
// Response Actions
// ============================================

export type UserResponse = 
  | { type: 'business' }
  | { type: 'personal' }
  | { type: 'receipt'; mediaUrls: string[] }
  | { type: 'unknown'; rawMessage: string };

export function parseUserResponse(message: TwilioInboundMessage): UserResponse {
  const body = message.body.toLowerCase().trim();

  // Check for receipt upload (has media attachments)
  if (message.numMedia > 0) {
    return { type: 'receipt', mediaUrls: message.mediaUrls };
  }

  // Check for keyword responses
  if (['1', 'business', 'biz', 'work', 'yes'].includes(body)) {
    return { type: 'business' };
  }

  if (['2', 'personal', 'personal expense', 'no', 'mine'].includes(body)) {
    return { type: 'personal' };
  }

  if (['3', 'receipt', 'uploading', 'upload'].includes(body)) {
    return { type: 'receipt', mediaUrls: [] };
  }

  return { type: 'unknown', rawMessage: message.body };
}

// Extract transaction reference ID from message body
export function extractTransactionRef(body: string): string | null {
  const refMatch = body.match(/Ref:\s*(tx-[\w-]+)/);
  return refMatch ? refMatch[1] : null;
}
