#!/usr/bin/env node
/* ============================================
   AUTOKKEEP — Database Migration Runner
   
   Executes SQL migrations against Supabase via 
   the pg-meta /pg/query API endpoint.
   
   Usage:
     node scripts/migrate.mjs              # Run pending migrations
     node scripts/migrate.mjs --status     # Show migration status
     node scripts/migrate.mjs --dry-run    # Show what would run
     node scripts/migrate.mjs --force 003  # Re-run a specific migration
   ============================================ */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'lib', 'supabase', 'migrations');

// --- Configuration ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  if (!SUPABASE_URL) console.error('   - NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  if (!SERVICE_ROLE_KEY) console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const PG_META_URL = `${SUPABASE_URL}/pg/query`;

// --- SQL Execution via pg-meta ---
async function execSQL(query) {
  const response = await fetch(PG_META_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`pg-meta error (${response.status}): ${body}`);
  }

  return response.json();
}

// --- Ensure migration tracking table exists ---
async function ensureMigrationsTable() {
  await execSQL(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_time_ms INTEGER,
      applied_by TEXT DEFAULT 'migrate.mjs'
    );
  `);
}

// --- Get applied migrations ---
async function getAppliedMigrations() {
  try {
    const rows = await execSQL(
      `SELECT filename, checksum, applied_at FROM _schema_migrations ORDER BY filename`
    );
    return new Map(rows.map(r => [r.filename, r]));
  } catch {
    return new Map();
  }
}

// --- Simple checksum (djb2 hash) ---
function checksum(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

// --- Discover migration files ---
function discoverMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Lexicographic sort ensures order: 001, 002, 003, 003b, 004...

  return files.map(filename => {
    const content = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
    return {
      filename,
      content,
      checksum: checksum(content),
    };
  });
}

// --- Run a single migration ---
async function runMigration(migration) {
  const start = Date.now();
  
  try {
    // Execute the migration SQL
    await execSQL(migration.content);
    
    const elapsed = Date.now() - start;
    
    // Record in tracking table
    await execSQL(`
      INSERT INTO _schema_migrations (filename, checksum, execution_time_ms)
      VALUES ('${migration.filename}', '${migration.checksum}', ${elapsed})
      ON CONFLICT (filename) DO UPDATE SET
        checksum = EXCLUDED.checksum,
        applied_at = NOW(),
        execution_time_ms = EXCLUDED.execution_time_ms;
    `);
    
    return { success: true, elapsed };
  } catch (error) {
    return { success: false, error: error.message, elapsed: Date.now() - start };
  }
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isDryRun = args.includes('--dry-run');
  const forceIdx = args.indexOf('--force');
  const forcePrefix = forceIdx !== -1 ? args[forceIdx + 1] : null;

  console.log('🔄 Autokkeep Migration Runner');
  console.log(`   Target: ${SUPABASE_URL}`);
  console.log('');

  // Ensure tracking table
  await ensureMigrationsTable();

  // Get state
  const applied = await getAppliedMigrations();
  const migrations = discoverMigrations();

  if (isStatus) {
    console.log(`📋 Migration Status (${migrations.length} files, ${applied.size} applied)\n`);
    for (const m of migrations) {
      const app = applied.get(m.filename);
      if (app) {
        const drift = app.checksum !== m.checksum ? ' ⚠️  CHECKSUM DRIFT' : '';
        console.log(`  ✅ ${m.filename} — applied ${new Date(app.applied_at).toISOString()}${drift}`);
      } else {
        console.log(`  ⏳ ${m.filename} — PENDING`);
      }
    }
    return;
  }

  // Determine what to run
  let pending;
  if (forcePrefix) {
    pending = migrations.filter(m => m.filename.startsWith(forcePrefix));
    if (pending.length === 0) {
      console.error(`❌ No migration files matching prefix "${forcePrefix}"`);
      process.exit(1);
    }
    console.log(`🔧 Force re-running ${pending.length} migration(s) matching "${forcePrefix}"\n`);
  } else {
    pending = migrations.filter(m => !applied.has(m.filename));
  }

  if (pending.length === 0) {
    console.log('✅ All migrations are up to date. Nothing to run.');
    return;
  }

  console.log(`📦 ${pending.length} migration(s) to apply:\n`);
  for (const m of pending) {
    console.log(`   ${m.filename} (${m.content.length} bytes)`);
  }
  console.log('');

  if (isDryRun) {
    console.log('🏃 Dry run — no changes applied.');
    return;
  }

  // Execute
  let succeeded = 0;
  let failed = 0;

  for (const migration of pending) {
    process.stdout.write(`  ▶ ${migration.filename}...`);
    const result = await runMigration(migration);
    
    if (result.success) {
      console.log(` ✅ (${result.elapsed}ms)`);
      succeeded++;
    } else {
      console.log(` ❌ FAILED (${result.elapsed}ms)`);
      console.error(`    Error: ${result.error}`);
      failed++;
      // Continue to next migration — don't halt on failure
      // (migrations use IF NOT EXISTS so order issues are recoverable)
    }
  }

  console.log('');
  console.log(`📊 Results: ${succeeded} succeeded, ${failed} failed, ${migrations.length - pending.length} already applied`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Migration runner failed:', err.message);
  process.exit(1);
});
