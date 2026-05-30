#!/usr/bin/env tsx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Migration 010: Encrypt existing Plaid access tokens
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Run: TOKEN_ENCRYPTION_KEY=<key> npx tsx src/lib/supabase/migrations/010_encrypt_existing_plaid_tokens.ts
//
// This script encrypts any plaintext Plaid access tokens in the bank_connections table.
// It's idempotent — already-encrypted tokens are skipped.

import { createClient } from '@supabase/supabase-js';

// We can't use the app's crypto module directly since it's a standalone script,
// so inline the encryption logic (mirrors src/lib/crypto.ts)
import { createCipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — matches src/lib/crypto.ts
const AUTH_TAG_LENGTH = 16; // 128 bits

function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required');
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return key;
}

function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: iv (12) + ciphertext (variable) + authTag (16)
  // Format matches src/lib/crypto.ts: "enc:" + base64(iv + ciphertext + authTag)
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return `enc:${packed.toString('base64')}`;
}

function isAlreadyEncrypted(token: string): boolean {
  // Encrypted tokens use the "enc:" prefix (matches src/lib/crypto.ts)
  return token.startsWith('enc:');
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('🔐 Migration 010: Encrypt existing Plaid access tokens');
  console.log(`   Supabase URL: ${supabaseUrl}`);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch all bank connections with tokens
  const { data: connections, error } = await supabase
    .from('bank_connections')
    .select('id, plaid_access_token, institution_name')
    .not('plaid_access_token', 'is', null);

  if (error) {
    console.error('❌ Failed to fetch bank connections:', error.message);
    process.exit(1);
  }

  if (!connections?.length) {
    console.log('✅ No bank connections with tokens found. Nothing to migrate.');
    return;
  }

  console.log(`   Found ${connections.length} bank connection(s) with tokens`);

  let encrypted = 0;
  let skipped = 0;
  let failed = 0;

  for (const conn of connections) {
    const token = conn.plaid_access_token;
    if (!token) {
      skipped++;
      continue;
    }

    if (isAlreadyEncrypted(token)) {
      console.log(`   ⏭  ${conn.institution_name || conn.id} — already encrypted`);
      skipped++;
      continue;
    }

    try {
      const encryptedToken = encryptToken(token);
      const { error: updateError } = await supabase
        .from('bank_connections')
        .update({ plaid_access_token: encryptedToken })
        .eq('id', conn.id);

      if (updateError) {
        console.error(`   ❌ ${conn.institution_name || conn.id} — update failed: ${updateError.message}`);
        failed++;
      } else {
        console.log(`   ✅ ${conn.institution_name || conn.id} — encrypted (${encrypted + 1} of ${connections.length})`);
        encrypted++;
      }
    } catch (err) {
      console.error(`   ❌ ${conn.institution_name || conn.id} — encryption failed:`, err);
      failed++;
    }
  }

  console.log('');
  console.log(`🏁 Migration complete:`);
  console.log(`   ✅ Encrypted: ${encrypted}`);
  console.log(`   ⏭  Skipped (already encrypted): ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
