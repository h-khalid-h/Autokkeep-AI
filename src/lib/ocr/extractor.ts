// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — OCR Receipt Data Extractor (OpenAI Vision)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import OpenAI from 'openai';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LineItem {
  description: string;
  amount: number;
}

export interface ExtractedReceiptData {
  vendor: string;
  amount: number;
  date: string;
  tax: number | null;
  currency: string;
  lineItems: LineItem[];
  businessPurpose: string | null;
}

// ─── OpenAI Client ─────────────────────────────────────────────────────────────

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000, // 60 second timeout for vision tasks
      maxRetries: 2,
    });
  }
  return openaiClient;
}

// ─── System Prompt ─────────────────────────────────────────────────────────────

const RECEIPT_EXTRACTION_PROMPT = `You are an expert receipt/invoice OCR data extractor. Analyze the provided receipt or invoice image and extract structured data.

Rules:
- Extract the vendor/merchant name exactly as shown on the receipt
- Extract the total amount as a number (no currency symbols)
- Extract the date in ISO 8601 format (YYYY-MM-DD)
- Extract the tax amount if visible, otherwise return null
- Detect the currency from the receipt (default to "USD" if unclear)
- Extract individual line items with their descriptions and amounts
- Infer the business purpose from context clues such as the vendor type, line items, and any notes on the receipt (e.g. "Client lunch", "Office supplies", "Travel expense"). Return null if no business purpose can be reasonably inferred.
- If a field cannot be determined, use reasonable defaults:
  - vendor: "Unknown Vendor"
  - amount: 0
  - date: today's date in YYYY-MM-DD
  - currency: "USD"
  - lineItems: empty array
  - business_purpose: null`;

// ─── Extractor ─────────────────────────────────────────────────────────────────

/**
 * Extracts structured receipt data from an image URL using OpenAI Vision (GPT-4o).
 * Sends the image to GPT-4o with a system prompt requesting structured JSON output.
 *
 * @param fileUrl - Public URL of the receipt image
 * @returns Extracted receipt data with vendor, amount, date, tax, currency, and line items
 * @throws Error if the API call fails or returns empty/invalid data
 */
export async function extractReceiptData(fileUrl: string): Promise<ExtractedReceiptData> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: RECEIPT_EXTRACTION_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract the receipt data from this image and return structured JSON.',
          },
          {
            type: 'image_url',
            image_url: { url: fileUrl, detail: 'high' },
          },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'receipt_extraction',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            vendor: { type: 'string' },
            amount: { type: 'number' },
            date: { type: 'string' },
            tax: { type: ['number', 'null'] },
            currency: { type: 'string' },
            lineItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  amount: { type: 'number' },
                },
                required: ['description', 'amount'],
                additionalProperties: false,
              },
            },
            business_purpose: { type: ['string', 'null'] },
          },
          required: ['vendor', 'amount', 'date', 'tax', 'currency', 'lineItems', 'business_purpose'],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI Vision');
  }

  // The OpenAI JSON schema uses snake_case; we map to camelCase in our interface.
  const parsed: ExtractedReceiptData & { business_purpose?: string | null } =
    JSON.parse(content);

  // Validate required fields
  if (!parsed.vendor || typeof parsed.amount !== 'number') {
    throw new Error('Invalid receipt data: missing vendor or amount');
  }

  return {
    vendor: parsed.vendor,
    amount: parsed.amount,
    date: parsed.date || new Date().toISOString().split('T')[0],
    tax: parsed.tax ?? null,
    currency: parsed.currency || 'USD',
    lineItems: Array.isArray(parsed.lineItems)
      ? parsed.lineItems.map((item) => ({
          description: item.description,
          amount: item.amount,
        }))
      : [],
    businessPurpose: parsed.business_purpose ?? parsed.businessPurpose ?? null,
  };
}
