// ============================================
// Application-Layer Token Encryption
// ============================================
// Encrypts/decrypts sensitive tokens (OAuth access_token, refresh_token)
// before storing in the database. Uses AES-256-GCM with a per-token IV.
//
// Requires: TOKEN_ENCRYPTION_KEY env var (32-byte hex key, 64 characters)
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// ============================================

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the encryption key from environment.
 * Returns null if not configured (graceful degradation).
 */
function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    return null;
  }
  if (keyHex.length !== 64) {
    console.warn('[Crypto] TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Encryption disabled.');
    return null;
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext token.
 * Output format: base64(iv + ciphertext + authTag)
 * 
 * If TOKEN_ENCRYPTION_KEY is not set, returns the plaintext unchanged
 * (graceful degradation for development).
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + ciphertext (variable) + authTag (16)
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return `enc:${packed.toString('base64')}`;
}

/**
 * Decrypt an encrypted token.
 * If the input doesn't start with 'enc:', it's treated as plaintext
 * (backward compatibility with unencrypted tokens).
 */
export function decryptToken(ciphertext: string): string {
  // Not encrypted — return as-is (backward compat)
  if (!ciphertext.startsWith('enc:')) return ciphertext;

  const key = getEncryptionKey();
  if (!key) {
    console.warn('[Crypto] Cannot decrypt token: TOKEN_ENCRYPTION_KEY not set');
    return ciphertext;
  }

  const packed = Buffer.from(ciphertext.slice(4), 'base64');

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted token: too short');
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH, packed.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Check if a token value is encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith('enc:');
}
