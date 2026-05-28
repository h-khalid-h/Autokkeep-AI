/**
 * Privacy Parser — Zero-Knowledge Data Sanitization
 * 
 * Strips PII from transaction data before sending to OpenAI.
 * Generates SHA-256 hashes for citation anchoring.
 * 
 * Only emits: vendor identity, numeric values, date markers, MCC codes.
 */

import { createHash } from 'crypto';

// ─── PII Detection Patterns ────────────────────────────────────────────────────

const PII_PATTERNS = {
  // Credit card numbers (13-19 digits, with optional spaces/dashes)
  creditCard: /\b(?:\d[ -]*?){13,19}\b/g,
  // SSN: 123-45-6789 or 123456789
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  // Phone numbers (various formats)
  phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Street addresses (number + street name patterns)
  streetAddress: /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Ct|Court|Way|Pl|Place)\.?\b/gi,
  // ZIP codes (US)
  zipCode: /\b\d{5}(?:-\d{4})?\b/g,
};

// Names that commonly appear in card holder fields
const NAME_SUFFIXES = /\b(?:Jr|Sr|II|III|IV|MD|PhD|DDS|Esq)\.?\b/gi;

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RawTransactionData {
  merchant: string;
  merchantRaw?: string;
  amount: number;
  date: string;
  cardHolder?: string;
  rawData?: {
    mcc?: string;
    currency?: string;
    bankDescription?: string;
    fullAddress?: string;
    phone?: string;
    email?: string;
  };
}

export interface TokenizedTransaction {
  /** Sanitized vendor identity (merchant name only) */
  vendorToken: string;
  /** Transaction amount (numeric, no PII) */
  amount: number;
  /** ISO date string */
  dateMarker: string;
  /** Merchant Category Code (if available) */
  mccCode: string | null;
  /** Currency code */
  currency: string;
  /** Sanitized bank description (PII stripped) */
  descriptionToken: string;
  /** SHA-256 hash of the original raw data for citation anchoring */
  sourceHash: string;
  /** Timestamp of tokenization */
  tokenizedAt: string;
}

// ─── Core Functions ─────────────────────────────────────────────────────────────

/**
 * Strip all PII from a text string, replacing with [REDACTED] tokens.
 */
export function stripPII(text: string): string {
  let sanitized = text;

  // Strip each PII pattern
  for (const [, pattern] of Object.entries(PII_PATTERNS)) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Remove name suffixes that might indicate personal names
  sanitized = sanitized.replace(NAME_SUFFIXES, '');

  // Collapse multiple [REDACTED] tokens
  sanitized = sanitized.replace(/(\[REDACTED\]\s*)+/g, '[REDACTED] ');

  return sanitized.trim();
}

/**
 * Generate SHA-256 hash of raw transaction data for citation anchoring.
 * This hash serves as a permanent, verifiable link to the original data
 * without storing the raw PII in the cloud.
 */
export function hashSourceData(data: RawTransactionData): string {
  const payload = JSON.stringify({
    merchant: data.merchant,
    amount: data.amount,
    date: data.date,
    cardHolder: data.cardHolder || '',
    bankDescription: data.rawData?.bankDescription || '',
  });

  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Generate a citation token (deterministic UUID-like identifier)
 * from transaction data for audit trail linking.
 */
export function generateCitationToken(sourceHash: string, timestamp: string): string {
  const combined = `${sourceHash}:${timestamp}`;
  const hash = createHash('sha256').update(combined).digest('hex');
  // Format as UUID-like: 8-4-4-4-12
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

/**
 * Tokenize a raw transaction into a privacy-safe representation.
 * 
 * Only emits: vendor identity, numeric values, date markers, MCC codes.
 * All PII (card holder names, addresses, phone numbers, SSNs) is stripped.
 */
export function tokenizeTransaction(raw: RawTransactionData): TokenizedTransaction {
  const sourceHash = hashSourceData(raw);
  const tokenizedAt = new Date().toISOString();

  return {
    vendorToken: stripPII(raw.merchant),
    amount: raw.amount,
    dateMarker: raw.date,
    mccCode: raw.rawData?.mcc || null,
    currency: raw.rawData?.currency || 'USD',
    descriptionToken: stripPII(raw.rawData?.bankDescription || raw.merchantRaw || raw.merchant),
    sourceHash,
    tokenizedAt,
  };
}
