import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAdminEmail } from './admin';

describe('admin - isAdminEmail', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Positive matches ──────────────────────────────────────────────────────

  it('returns true for an email in the ADMIN_EMAILS list', () => {
    process.env.ADMIN_EMAILS = 'alice@example.com,bob@example.com';
    expect(isAdminEmail('alice@example.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    process.env.ADMIN_EMAILS = 'Admin@Company.COM';
    expect(isAdminEmail('admin@company.com')).toBe(true);
    expect(isAdminEmail('ADMIN@COMPANY.COM')).toBe(true);
  });

  it('handles whitespace in ADMIN_EMAILS', () => {
    process.env.ADMIN_EMAILS = '  alice@x.com , bob@y.com  ';
    expect(isAdminEmail('alice@x.com')).toBe(true);
    expect(isAdminEmail('bob@y.com')).toBe(true);
  });

  it('matches the last email in a multi-entry list', () => {
    process.env.ADMIN_EMAILS = 'a@a.com,b@b.com,c@c.com';
    expect(isAdminEmail('c@c.com')).toBe(true);
  });

  // ── Negative cases ────────────────────────────────────────────────────────

  it('returns false for a non-admin email', () => {
    process.env.ADMIN_EMAILS = 'alice@example.com';
    expect(isAdminEmail('eve@hacker.com')).toBe(false);
  });

  it('returns false when email is undefined', () => {
    process.env.ADMIN_EMAILS = 'alice@example.com';
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it('returns false when email is empty string', () => {
    process.env.ADMIN_EMAILS = 'alice@example.com';
    expect(isAdminEmail('')).toBe(false);
  });

  it('returns false when ADMIN_EMAILS is not set', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail('anyone@example.com')).toBe(false);
  });

  it('returns false when ADMIN_EMAILS is empty string', () => {
    process.env.ADMIN_EMAILS = '';
    expect(isAdminEmail('anyone@example.com')).toBe(false);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('does not match partial emails', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    expect(isAdminEmail('admin@example.co')).toBe(false);
    expect(isAdminEmail('admin@example.com.evil.com')).toBe(false);
  });

  it('handles single-entry ADMIN_EMAILS', () => {
    process.env.ADMIN_EMAILS = 'solo@admin.com';
    expect(isAdminEmail('solo@admin.com')).toBe(true);
    expect(isAdminEmail('not@admin.com')).toBe(false);
  });
});
