import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Utility to set env vars safely
function setEnv(overrides: Record<string, string | undefined>) {
  const originals: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

describe('validateEnv', () => {
  // Store original env to restore after each test
  const savedEnv: Record<string, string | undefined> = {};
  const criticalVars = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-key-value',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service-role-key',
    OPENAI_API_KEY: 'sk-test-1234567890abcdef',
    STRIPE_SECRET_KEY: 'sk_test_abcdef1234567890',
    STRIPE_WEBHOOK_SECRET: 'whsec_abcdef1234567890',
    CRON_SECRET: 'a-very-long-secret-for-cron-jobs',
    TOKEN_ENCRYPTION_KEY: 'another-long-secret-key',
    NEXT_PUBLIC_APP_URL: 'https://autokkeep.com',
  };

  beforeEach(() => {
    // Save all critical vars
    for (const key of Object.keys(criticalVars)) {
      savedEnv[key] = process.env[key];
    }
    // Set critical vars
    for (const [key, value] of Object.entries(criticalVars)) {
      process.env[key] = value;
    }
  });

  afterEach(() => {
    // Restore original env
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('should pass with all critical vars set', async () => {
    const { validateEnv } = await import('../env');
    expect(() => validateEnv()).not.toThrow();
  });

  it('should throw when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Re-import to clear module cache
    const { validateEnv } = await import('../env');
    expect(() => validateEnv()).toThrow('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('should throw when OPENAI_API_KEY has wrong prefix', async () => {
    process.env.OPENAI_API_KEY = 'not-an-openai-key';
    const { validateEnv } = await import('../env');
    expect(() => validateEnv()).toThrow('OPENAI_API_KEY');
  });

  it('should throw when STRIPE_SECRET_KEY has wrong prefix', async () => {
    process.env.STRIPE_SECRET_KEY = 'wrong-prefix';
    const { validateEnv } = await import('../env');
    expect(() => validateEnv()).toThrow('STRIPE_SECRET_KEY');
  });

  it('should warn but not throw for missing optional vars', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Remove an optional var
    const restore = setEnv({ PLAID_CLIENT_ID: undefined });
    const { validateEnv } = await import('../env');
    expect(() => validateEnv()).not.toThrow();
    restore();
    errorSpy.mockRestore();
  });

  it('should validate TWILIO_ACCOUNT_SID prefix', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'invalid-sid';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { validateEnv } = await import('../env');
    // Should warn but not throw (optional var)
    expect(() => validateEnv()).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
