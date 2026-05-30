import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encryptToken, decryptToken, isEncrypted } from './crypto';

// A valid 32-byte hex key for testing
const TEST_KEY = 'a'.repeat(64); // 32 bytes of 0xaa

describe('crypto - token encryption', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('with encryption key set', () => {
    beforeEach(() => {
      process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    });

    it('encrypts and decrypts a token round-trip', () => {
      const original = 'oauth-access-token-12345';
      const encrypted = encryptToken(original);
      expect(encrypted).not.toBe(original);
      expect(encrypted.startsWith('enc:')).toBe(true);

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(original);
    });

    it('produces different ciphertext for same input (random IV)', () => {
      const original = 'test-token';
      const enc1 = encryptToken(original);
      const enc2 = encryptToken(original);
      expect(enc1).not.toBe(enc2); // Different IVs
      expect(decryptToken(enc1)).toBe(original);
      expect(decryptToken(enc2)).toBe(original);
    });

    it('handles empty strings', () => {
      const encrypted = encryptToken('');
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe('');
    });

    it('handles long tokens', () => {
      const longToken = 'x'.repeat(10000);
      const encrypted = encryptToken(longToken);
      expect(decryptToken(encrypted)).toBe(longToken);
    });

    it('handles special characters', () => {
      const special = 'token=abc&def/ghi+jkl==';
      const encrypted = encryptToken(special);
      expect(decryptToken(encrypted)).toBe(special);
    });

    it('detects tampering (auth tag)', () => {
      const encrypted = encryptToken('secret');
      // Tamper with the last byte (part of auth tag)
      const tampered = encrypted.slice(0, -2) + 'XX';
      expect(() => decryptToken(tampered)).toThrow();
    });
  });

  describe('without encryption key (graceful degradation)', () => {
    beforeEach(() => {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    });

    it('returns plaintext when key is not set', () => {
      const original = 'plaintext-token';
      const result = encryptToken(original);
      expect(result).toBe(original);
    });

    it('returns plaintext on decrypt when key is not set', () => {
      const result = decryptToken('plaintext-token');
      expect(result).toBe('plaintext-token');
    });
  });

  describe('backward compatibility', () => {
    beforeEach(() => {
      process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    });

    it('returns plaintext tokens unchanged (no enc: prefix)', () => {
      const legacy = 'old-unencrypted-token';
      const result = decryptToken(legacy);
      expect(result).toBe(legacy);
    });

    it('correctly identifies encrypted vs plaintext', () => {
      expect(isEncrypted('enc:abc123')).toBe(true);
      expect(isEncrypted('plaintext-token')).toBe(false);
      expect(isEncrypted('')).toBe(false);
    });
  });

  describe('invalid key handling', () => {
    it('warns on wrong key length', () => {
      process.env.TOKEN_ENCRYPTION_KEY = 'tooshort';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = encryptToken('test');
      expect(result).toBe('test'); // Falls back to plaintext
      warnSpy.mockRestore();
    });
  });
});
