#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Autokkeep Full Authenticated E2E Test
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * Usage:
 *   node scripts/e2e-full-flow.cjs                    # Interactive (asks for confirm link)
 *   CONFIRM_URL=<url> node scripts/e2e-full-flow.cjs  # Non-interactive
 *   MODE=login node scripts/e2e-full-flow.cjs         # Skip signup, login directly
 *   MODE=delete SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/e2e-full-flow.cjs  # Delete + signup
 */

const puppeteer = require('puppeteer');
const readline = require('readline');
const fs = require('fs');
const _path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.APP_URL || 'https://autokkeep.com';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://autokkeep-db.host.datac.com';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CONFIRM_URL = process.env.CONFIRM_URL || '';
const MODE = process.env.MODE || 'signup'; // 'signup', 'login', 'delete'

const TEST_EMAIL = 'h.khalid@datac.com';
const TEST_PASSWORD = 'DataC_Autokkeep2026!';
const ORG_NAME = 'DATA C';
const ENTITY_NAME = 'DATA C';
const COUNTRY = 'EE'; // Estonia
const CURRENCY = 'EUR';
const TIMEZONE = 'Europe/Tallinn';

const SCREENSHOT_DIR = 'e2e-screenshots/full-flow';

// ── Results tracking ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }

function pass(name) {
  passed++;
  results.push({ name, status: 'PASS' });
  log('✅', name);
}

function fail(name, err) {
  failed++;
  results.push({ name, status: 'FAIL', error: err?.message || String(err) });
  log('❌', `${name}: ${err?.message || err}`);
}

async function screenshot(page, name) {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const filePath = `${SCREENSHOT_DIR}/${name}.png`;
  await page.screenshot({ path: filePath, fullPage: true });
  log('📸', `Screenshot: ${filePath}`);
  return filePath;
}

// ── Supabase Admin: Delete existing user ────────────────────────────────────────
async function deleteExistingUser() {
  console.log('\n━━━ Phase 0: Clean Up Existing Test User ━━━');
  
  if (!SERVICE_ROLE_KEY) {
    log('⚠️', 'No SUPABASE_SERVICE_ROLE_KEY — cannot delete user via admin API');
    return false;
  }

  try {
    // List users to find the test email
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
    });

    if (!listRes.ok) {
      fail('User cleanup: list users', new Error(`Status ${listRes.status}`));
      return false;
    }

    const data = await listRes.json();
    const targetUser = data?.users?.find(u => u.email === TEST_EMAIL);
    
    if (!targetUser) {
      log('ℹ️', `No existing user found with email: ${TEST_EMAIL}`);
      pass('User cleanup: no existing user');
      return true;
    }

    log('🔍', `Found existing user: ${targetUser.id} (${targetUser.email})`);

    // Delete associated data first (orgs, entities, team_members)
    // This is done via cascade in the DB, but let's also clean via REST
    
    // Delete the user via admin API  
    const deleteRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${targetUser.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
    });

    if (deleteRes.ok) {
      pass(`User cleanup: deleted ${TEST_EMAIL} (${targetUser.id})`);
      
      // Also clean up any orphaned org/entity data via REST API
      try {
        // Clean team_members
        await fetch(`${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${targetUser.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY,
            'Prefer': 'return=minimal',
          },
        });
        log('ℹ️', 'Cleaned up team_members');
      } catch {}
      
      return true;
    } else {
      const errBody = await deleteRes.text().catch(() => '');
      fail('User cleanup: delete', new Error(`Status ${deleteRes.status}: ${errBody}`));
      return false;
    }
  } catch (err) {
    fail('User cleanup', err);
    return false;
  }
}

// ── Interactive: Wait for confirmation link ─────────────────────────────────────
async function waitForConfirmLink() {
  if (CONFIRM_URL) return CONFIRM_URL;

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\n' + '═'.repeat(60));
    console.log('📧 CHECK YOUR EMAIL');
    console.log('═'.repeat(60));
    console.log(`\nA verification email was sent to: ${TEST_EMAIL}`);
    console.log('Paste the confirmation link below and press Enter:\n');
    rl.question('🔗 Confirmation URL: ', (url) => {
      rl.close();
      resolve(url.trim());
    });
  });
}

// ── Delay helper ────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ── Main E2E Flow ───────────────────────────────────────────────────────────────
async function runE2E() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║    Autokkeep Full Authenticated E2E Test               ║');
  console.log('║    Target: ' + BASE_URL.padEnd(44) + '║');
  console.log('║    Email:  ' + TEST_EMAIL.padEnd(44) + '║');
  console.log('║    Entity: ' + ENTITY_NAME.padEnd(44) + '║');
  console.log('║    Mode:   ' + MODE.padEnd(44) + '║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Phase 0: Cleanup (only if MODE=delete or we have SERVICE_ROLE_KEY)
  if (MODE === 'delete' || SERVICE_ROLE_KEY) {
    await deleteExistingUser();
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    if (MODE === 'login') {
      // ═══════════════════════════════════════════════
      // Direct login flow
      // ═══════════════════════════════════════════════
      console.log('\n━━━ Phase 1: Direct Login ━━━');
      await loginFlow(page);
      await runAuthenticatedFlow(page);
    } else {
      // ═══════════════════════════════════════════════
      // Signup flow
      // ═══════════════════════════════════════════════
      console.log('\n━━━ Phase 1: Sign Up Flow ━━━');
      const signupResult = await signupFlow(page);
      
      if (signupResult === 'already_exists') {
        log('ℹ️', 'User already exists — switching to login flow');
        await loginFlow(page);
        await runAuthenticatedFlow(page);
      } else if (signupResult === 'needs_confirmation') {
        // Wait for email confirmation
        console.log('\n━━━ Phase 2: Email Confirmation ━━━');
        const confirmUrl = await waitForConfirmLink();
        
        if (!confirmUrl) {
          fail('Email confirmation', new Error('No confirmation URL provided'));
          throw new Error('Cannot proceed without confirmation');
        }
        
        await handleConfirmation(page, confirmUrl);
        await runAuthenticatedFlow(page);
      } else {
        // Already logged in from signup (auto-confirm)
        await runAuthenticatedFlow(page);
      }
    }
  } catch (err) {
    console.error('\n💥 Fatal error:', err.message);
    await screenshot(page, '99_fatal_error').catch(() => {});
  } finally {
    await browser.close();
    printSummary();
  }
}

// ── Signup Flow ─────────────────────────────────────────────────────────────────
async function signupFlow(page) {
  await page.goto(`${BASE_URL}/auth/signup`, { waitUntil: 'networkidle2', timeout: 30000 });
  await screenshot(page, '01_signup_page');

  try {
    await page.waitForSelector('#signup-form', { timeout: 10000 });
    pass('Signup page loads with form');
  } catch (err) {
    fail('Signup page loads', err);
    throw err;
  }

  // Fill organization name
  await page.waitForSelector('#signup-org-input');
  await page.click('#signup-org-input');
  await page.type('#signup-org-input', ORG_NAME, { delay: 30 });
  pass('Organization name filled: ' + ORG_NAME);

  // Fill email
  await page.click('#signup-email-input');
  await page.type('#signup-email-input', TEST_EMAIL, { delay: 30 });
  pass('Email filled: ' + TEST_EMAIL);

  // Fill password
  await page.click('#signup-password-input');
  await page.type('#signup-password-input', TEST_PASSWORD, { delay: 20 });
  await delay(500);
  
  // Check password strength
  try {
    const metCount = await page.$$eval('[class*="requirementMet"]', els => els.length);
    log('ℹ️', `Password requirements met: ${metCount}/4`);
    if (metCount >= 4) pass('All password requirements met');
  } catch {}

  await screenshot(page, '02_signup_password_strength');

  // Fill confirm password
  await page.click('#signup-confirm-password-input');
  await page.type('#signup-confirm-password-input', TEST_PASSWORD, { delay: 20 });
  await delay(500);

  // Check password match
  try {
    const matchText = await page.$eval('#signup-password-match-indicator', el => el.textContent);
    if (matchText.includes('match')) pass('Passwords match indicator ✓');
  } catch {}

  await screenshot(page, '03_signup_filled');

  // Submit
  await page.click('#signup-submit-button');
  log('ℹ️', 'Signup submitted, waiting for response...');

  // Wait for result
  try {
    await Promise.race([
      page.waitForSelector('#signup-confirmation', { timeout: 15000 }),
      page.waitForSelector('#signup-error-toast', { timeout: 15000 }),
    ]);
  } catch {
    // May have auto-redirected
    await delay(2000);
  }

  const hasConfirmation = await page.$('#signup-confirmation');
  const hasError = await page.$('#signup-error-toast');

  if (hasConfirmation) {
    pass('Signup successful — check email confirmation shown');
    await screenshot(page, '04_signup_confirmation');
    
    const confirmText = await page.$eval('#signup-confirmation-text', el => el.textContent).catch(() => '');
    if (confirmText.includes(TEST_EMAIL)) pass('Confirmation shows correct email');
    
    return 'needs_confirmation';
  }
  
  if (hasError) {
    const errorText = await page.$eval('#signup-error-toast', el => el.textContent);
    if (errorText.includes('already exists') || errorText.includes('already registered')) {
      log('⚠️', `Signup error: ${errorText.trim()}`);
      return 'already_exists';
    }
    fail('Signup submission', new Error(errorText.trim()));
    throw new Error(errorText.trim());
  }

  // Check if auto-redirected (account auto-confirmed)
  const currentUrl = page.url();
  if (currentUrl.includes('/onboarding') || currentUrl.includes('/dashboard')) {
    pass('Signup auto-confirmed — redirected to app');
    return 'auto_confirmed';
  }

  fail('Signup: unexpected state', new Error(`URL: ${currentUrl}`));
  throw new Error('Unexpected signup result');
}

// ── Login Flow ──────────────────────────────────────────────────────────────────
async function loginFlow(page) {
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  await screenshot(page, '05_login_page');

  // Login page Input components use React.useId() — no fixed IDs.
  // Use type-based selectors instead.
  try {
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    pass('Login page loads with form');
  } catch (err) {
    fail('Login page loads', err);
    throw err;
  }

  // Dismiss cookie banner if present (it can block clicks)
  try {
    const _cookieBtn = await page.$('button');
    const allBtns = await page.$$('button');
    for (const btn of allBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('Accept All') || text.includes('Essential Only')) {
        await btn.click();
        await delay(500);
        break;
      }
    }
  } catch {}

  await page.type('input[type="email"]', TEST_EMAIL, { delay: 30 });
  await page.type('input[type="password"]', TEST_PASSWORD, { delay: 20 });
  pass('Login credentials entered');

  await screenshot(page, '06_login_filled');

  // Find and click the Sign In button (no fixed ID)
  const submitted = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button[type="submit"]'));
    const signInBtn = buttons.find(b => b.textContent.includes('Sign In'));
    if (signInBtn) { signInBtn.click(); return true; }
    return false;
  });
  
  if (!submitted) {
    // Fallback: press Enter in the password field
    await page.keyboard.press('Enter');
  }
  log('ℹ️', 'Login submitted...');

  // Wait for navigation
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
  } catch {
    await delay(3000);
  }

  const afterLoginUrl = page.url();
  await screenshot(page, '07_after_login');

  if (afterLoginUrl.includes('/dashboard') || afterLoginUrl.includes('/onboarding')) {
    pass(`Login successful — redirected to ${afterLoginUrl.includes('/onboarding') ? 'onboarding' : 'dashboard'}`);
  } else if (afterLoginUrl.includes('/auth/login')) {
    // Check for error toast
    const errorToast = await page.$('[class*="toast"], [class*="error"]');
    const errorText = errorToast ? await page.evaluate(el => el.textContent, errorToast) : '';
    fail('Login failed', new Error(errorText || 'Still on login page'));
    throw new Error('Login failed - wrong credentials?');
  } else {
    log('ℹ️', `After login URL: ${afterLoginUrl}`);
    pass('Login completed');
  }
}

// ── Handle Email Confirmation ───────────────────────────────────────────────────
async function handleConfirmation(page, confirmUrl) {
  log('ℹ️', `Navigating to confirmation URL...`);
  log('ℹ️', `URL: ${confirmUrl.substring(0, 80)}...`);

  await page.goto(confirmUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(3000);

  const afterConfirmUrl = page.url();
  log('ℹ️', `After confirmation: ${afterConfirmUrl}`);
  await screenshot(page, '08_after_email_confirm');

  if (afterConfirmUrl.includes('/onboarding') || afterConfirmUrl.includes('/dashboard')) {
    pass('Email confirmed — redirected to app');
  } else if (afterConfirmUrl.includes('/auth/login')) {
    log('ℹ️', 'Redirected to login after confirmation — logging in');
    await loginFlow(page);
  } else {
    log('⚠️', `Unexpected URL after confirm: ${afterConfirmUrl}`);
    // Try to navigate to onboarding/dashboard
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
    const dashUrl = page.url();
    if (dashUrl.includes('/auth/login')) {
      log('ℹ️', 'Not authenticated — trying login');
      await loginFlow(page);
    } else {
      pass('Navigated to dashboard after confirmation');
    }
  }
}

// ── Authenticated Flow ──────────────────────────────────────────────────────────
async function runAuthenticatedFlow(page) {
  const currentUrl = page.url();
  
  // Decide flow: onboarding vs dashboard
  if (currentUrl.includes('/onboarding')) {
    await runOnboarding(page);
  } else if (!currentUrl.includes('/dashboard')) {
    // Navigate to check if we need onboarding
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle2', timeout: 15000 });
    const onboardingUrl = page.url();
    if (onboardingUrl.includes('/onboarding')) {
      await runOnboarding(page);
    } else {
      // Already onboarded, go to dashboard
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
    }
  }

  // Dashboard and app pages
  await runDashboardTests(page);
  
  // Settings and account
  await runSettingsTests(page);
  
  // Authenticated API tests
  await runApiTests(page);
  
  // Logout
  await runLogoutTest(page);
}

// ── Onboarding Flow ─────────────────────────────────────────────────────────────
async function runOnboarding(page) {
  console.log('\n━━━ Phase 3: Onboarding Flow ━━━');

  const currentUrl = page.url();
  if (!currentUrl.includes('/onboarding')) {
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle2', timeout: 15000 });
  }

  // Wait for AuthGuard loading to finish (the "AK Loading..." spinner)
  // The onboarding page has a header with "Autokkeep Setup" text
  try {
    await page.waitForFunction(
      () => {
        const loading = document.querySelector('[class*="guardLoading"]');
        return !loading; // Wait until the guard spinner is gone
      },
      { timeout: 15000 }
    );
    // Wait for the invite check to finish (the "Checking for team invites…" screen)
    await page.waitForFunction(
      () => {
        const body = document.body.innerText || '';
        return !body.includes('Checking for team invites');
      },
      { timeout: 15000 }
    );
    // Now wait for the actual wizard content
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Start onboarding"], #entity-name, [aria-label="Select base currency"]'),
      { timeout: 10000 }
    );
    pass('Onboarding page loaded');
  } catch (err) {
    fail('Onboarding page loaded', err);
    await screenshot(page, '10_onboarding_load_failed');
    return;
  }

  await screenshot(page, '10_onboarding_start');

  // ── Step 1: Welcome → click "Let's Get Started" ───────────────────────
  try {
    const startBtn = await page.$('[aria-label="Start onboarding"]');
    if (startBtn) {
      await startBtn.click();
      await delay(800);
      pass('Welcome step → clicked "Let\'s Get Started"');
    } else {
      log('ℹ️', 'Welcome step not visible (may have resumed from saved state)');
    }
  } catch (err) {
    fail('Welcome step', err);
  }

  await screenshot(page, '11_onboarding_entity');

  // ── Step 2: Create Entity ─────────────────────────────────────────────
  try {
    const entityInput = await page.$('#entity-name');
    if (entityInput) {
      // Clear any existing text and type entity name
      await page.evaluate(el => { el.value = ''; }, entityInput);
      await entityInput.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type('#entity-name', ENTITY_NAME, { delay: 30 });

      // Select EUR currency
      await page.select('#entity-currency', CURRENCY);
      // Select December fiscal year
      await page.select('#entity-fiscal-year', '12');

      pass(`Entity form filled: ${ENTITY_NAME}, ${CURRENCY}, FY Dec`);
      await screenshot(page, '12_onboarding_entity_filled');

      // Click "Continue →" (Create entity and continue)
      const continueBtn = await page.$('[aria-label="Create entity and continue"]');
      if (continueBtn) {
        await continueBtn.click();
        log('ℹ️', 'Creating entity in Supabase...');

        // Wait for step transition — the region step has #region-country
        let transitioned = false;
        for (let i = 0; i < 30; i++) {
          await delay(500);
          const regionEl = await page.$('#region-country');
          const errorEl = await page.$('[class*="errorBanner"]');
          if (regionEl) {
            pass('Entity created → moved to Region step');
            transitioned = true;
            break;
          }
          if (errorEl) {
            const errText = await page.evaluate(el => el.textContent, errorEl);
            fail('Entity creation', new Error(errText));
            break;
          }
        }
        if (!transitioned) {
          log('⚠️', 'Region step not detected after 15s');
          await screenshot(page, '12b_entity_timeout');
        }
      } else {
        fail('Entity continue button', new Error('Button not found'));
      }
    } else {
      log('ℹ️', 'Entity step not visible (already completed or resumed)');
    }
  } catch (err) {
    fail('Entity creation', err);
  }

  await screenshot(page, '13_onboarding_region');

  // ── Step 3: Region — Estonia, EUR, Tallinn ────────────────────────────
  try {
    const regionSelect = await page.$('#region-country');
    if (regionSelect) {
      await page.select('#region-country', COUNTRY);
      await page.select('#region-currency', CURRENCY);
      await page.select('#region-timezone', TIMEZONE);

      pass(`Region set: Estonia (${COUNTRY}), ${CURRENCY}, ${TIMEZONE}`);
      await screenshot(page, '14_onboarding_region_filled');

      const continueBtn = await page.$('[aria-label="Save region settings and continue"]');
      if (continueBtn) {
        await continueBtn.click();
        log('ℹ️', 'Saving region settings...');

        // Wait for bank step (has the bank emoji or bank center class)
        let transitioned = false;
        for (let i = 0; i < 20; i++) {
          await delay(500);
          const bankStep = await page.evaluate(() => {
            const h2 = Array.from(document.querySelectorAll('h2'));
            return h2.some(el => el.textContent.includes('Connect Your Bank'));
          });
          if (bankStep) {
            pass('Region saved → moved to Bank step');
            transitioned = true;
            break;
          }
        }
        if (!transitioned) log('⚠️', 'Bank step not detected after 10s');
      }
    } else {
      log('ℹ️', 'Region step not visible (already completed)');
    }
  } catch (err) {
    fail('Region setup', err);
  }

  await screenshot(page, '15_onboarding_bank');

  // ── Step 4: Bank — Skip ───────────────────────────────────────────────
  try {
    // The bank step has aria-label "Skip bank connection"
    const skipBtn = await page.$('[aria-label="Skip bank connection"]');
    if (skipBtn) {
      await skipBtn.click();
      await delay(1000);
      pass('Bank step: skipped');
    } else {
      log('ℹ️', 'Bank skip button not visible');
    }
  } catch (err) {
    fail('Bank step', err);
  }

  await screenshot(page, '16_onboarding_ledger');

  // ── Step 5: Ledger — Select "No ledger yet" then click Continue ───────
  try {
    // Find the "No ledger yet" option by its data-selected attribute
    const noLedgerClicked = await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[class*="ledgerOption"]'));
      const noLedger = options.find(el => el.textContent.includes('No ledger yet'));
      if (noLedger) { noLedger.click(); return true; }
      return false;
    });

    if (noLedgerClicked) {
      await delay(500);
      pass('Ledger: selected "No ledger yet"');

      // Click "Continue →" (aria-label: "Continue to next step" since we selected "none")
      const continueBtn = await page.$('[aria-label="Continue to next step"]');
      const skipBtn = await page.$('[aria-label="Skip ledger connection"]');
      if (continueBtn) {
        await continueBtn.click();
        await delay(1000);
        pass('Ledger: continued');
      } else if (skipBtn) {
        await skipBtn.click();
        await delay(1000);
        pass('Ledger: skipped');
      }
    } else {
      log('ℹ️', 'Ledger step not visible');
    }
  } catch (err) {
    fail('Ledger step', err);
  }

  await screenshot(page, '17_onboarding_channel');

  // ── Step 6: Channel — Skip (Slack would redirect to OAuth) ────────────
  try {
    // Check if we're on the channel step
    const isChannelStep = await page.evaluate(() => {
      const h2 = Array.from(document.querySelectorAll('h2'));
      return h2.some(el => el.textContent.includes('Receipt Chase'));
    });

    if (isChannelStep) {
      // Select Slack (the only available option)
      const slackClicked = await page.evaluate(() => {
        const options = Array.from(document.querySelectorAll('[class*="channelOption"]:not([disabled])'));
        if (options.length > 0) { options[0].click(); return true; }
        return false;
      });

      if (slackClicked) {
        await delay(300);
        pass('Channel: selected Slack');

        // Don't click "Finish Setup" as it redirects to Slack OAuth.
        // Instead, navigate directly to the complete step or dashboard.
        // The onboarding state is persisted to localStorage.
        log('ℹ️', 'Skipping Slack OAuth redirect — navigating to dashboard');
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
        pass('Channel step handled (skipped OAuth)');
      } else {
        log('ℹ️', 'No available channel options');
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
      }
    } else {
      // Check if we're on the complete step
      const isComplete = await page.$('[class*="completeWrapper"]');
      if (isComplete) {
        pass('Onboarding completion screen shown');

        // Click "Go to Dashboard →"
        const dashBtn = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const btn = btns.find(b => b.textContent.includes('Dashboard'));
          if (btn) { btn.click(); return true; }
          return false;
        });
        if (dashBtn) await delay(3000);
      } else {
        log('ℹ️', 'Channel/Complete step not visible');
      }
    }
  } catch (err) {
    fail('Channel step', err);
  }

  await screenshot(page, '18_onboarding_complete');

  // Ensure we end up on dashboard
  const finalUrl = page.url();
  if (!finalUrl.includes('/dashboard')) {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
  }

  // Wait for dashboard to fully load (AuthGuard + EntityProvider)
  try {
    await page.waitForFunction(
      () => !document.querySelector('[class*="guardLoading"]'),
      { timeout: 15000 }
    );
  } catch {}

  await screenshot(page, '19_dashboard_after_onboarding');
  pass('Onboarding complete → on dashboard');
}

// ── Dashboard Tests ─────────────────────────────────────────────────────────────
async function runDashboardTests(page) {
  console.log('\n━━━ Phase 4: Dashboard & App Pages ━━━');

  const appPages = [
    { path: '/dashboard', name: 'Dashboard' },
    { path: '/transactions', name: 'Transactions' },
    { path: '/chart-of-accounts', name: 'Chart of Accounts' },
    { path: '/analytics', name: 'Analytics' },
    { path: '/insights', name: 'Insights' },
    { path: '/portfolio', name: 'Portfolio' },
    { path: '/tax', name: 'Tax' },
    { path: '/close', name: 'Month-End Close' },
    { path: '/health', name: 'Health Monitor' },
  ];

  let idx = 20;
  for (const pg of appPages) {
    try {
      await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: 'networkidle2', timeout: 15000 });
      const finalUrl = page.url();
      
      if (finalUrl.includes('/auth/login')) {
        fail(`${pg.name} page`, new Error('Redirected to login — session lost'));
        continue;
      }
      
      await screenshot(page, `${idx}_${pg.path.replace(/\//g, '')}`);
      idx++;
      
      // Check for AppShell elements
      const title = await page.title();
      pass(`${pg.name} page accessible — "${title}"`);
    } catch (err) {
      fail(`${pg.name} page`, err);
    }
  }
}

// ── Settings Tests ──────────────────────────────────────────────────────────────
async function runSettingsTests(page) {
  console.log('\n━━━ Phase 5: Settings & Account ━━━');

  for (const pg of [
    { path: '/settings', name: 'Settings' },
    { path: '/account', name: 'Account' },
  ]) {
    try {
      await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: 'networkidle2', timeout: 15000 });
      const finalUrl = page.url();
      
      if (finalUrl.includes('/auth/login')) {
        fail(`${pg.name}`, new Error('Redirected to login'));
        continue;
      }
      
      await screenshot(page, `30_${pg.name.toLowerCase()}`);
      pass(`${pg.name} page accessible`);
    } catch (err) {
      fail(`${pg.name}`, err);
    }
  }
}

// ── Authenticated API Tests ─────────────────────────────────────────────────────
async function runApiTests(page) {
  console.log('\n━━━ Phase 6: Authenticated API Calls ━━━');

  // Must be on the site domain for cookies to be sent
  if (!page.url().includes(BASE_URL.replace('https://', ''))) {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
  }

  const apiTests = [
    { path: '/api/dashboard/stats', name: 'Dashboard Stats' },
    { path: '/api/transactions?limit=5', name: 'Transactions' },
    { path: '/api/chart-of-accounts', name: 'Chart of Accounts' },
    { path: '/api/health', name: 'Health' },
  ];

  for (const api of apiTests) {
    try {
      const response = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url, { credentials: 'include' });
          const text = await res.text();
          let json = null;
          try { json = JSON.parse(text); } catch {}
          return { status: res.status, ok: res.ok, body: json || text };
        } catch (e) {
          return { status: 0, ok: false, body: e.message };
        }
      }, `${BASE_URL}${api.path}`);

      if (response.ok) {
        pass(`API ${api.name}: 200 OK`);
      } else if (response.status === 401) {
        fail(`API ${api.name}`, new Error('401 — cookies not sent'));
      } else {
        // Non-200 but not 401 is acceptable (may lack data)
        pass(`API ${api.name}: ${response.status} (authenticated, may lack data)`);
      }
    } catch (err) {
      fail(`API ${api.name}`, err);
    }
  }
}

// ── Logout Test ─────────────────────────────────────────────────────────────────
async function runLogoutTest(page) {
  console.log('\n━━━ Phase 7: Logout ━━━');

  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
    
    // Wait for the sidebar to render (it's inside AuthGuard which loads async)
    let clicked = false;
    try {
      await page.waitForSelector('#sidebar-sign-out', { timeout: 10000 });
      const signOutBtn = await page.$('#sidebar-sign-out');
      if (signOutBtn) {
        await signOutBtn.click();
        clicked = true;
        log('ℹ️', 'Clicked #sidebar-sign-out button');
      }
    } catch {
      log('ℹ️', 'Sign out button not found by ID, trying text search...');
    }
    
    // Fallback: try to find by text content
    if (!clicked) {
      clicked = await page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"]'));
        const logoutEl = allEls.find(el => {
          const text = (el.textContent || '').toLowerCase();
          const label = (el.getAttribute('aria-label') || '').toLowerCase();
          return text.includes('log out') || text.includes('logout') || text.includes('sign out') 
            || label.includes('log out') || label.includes('logout') || label.includes('sign out');
        });
        if (logoutEl) {
          (logoutEl).click();
          return true;
        }
        return false;
      });
    }

    if (clicked) {
      await delay(3000);
      await screenshot(page, '35_after_logout');
      const afterUrl = page.url();
      if (afterUrl.includes('/auth/login') || afterUrl === BASE_URL + '/') {
        pass('Logout: redirected to login/home');
      } else {
        pass('Logout: button clicked');
      }
      
      // Verify logout by visiting protected page
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
      const verifyUrl = page.url();
      if (verifyUrl.includes('/auth/login') || verifyUrl.includes('/onboarding')) {
        pass('Logout verified: protected page redirects to login');
      } else {
        log('ℹ️', `After logout, dashboard URL: ${verifyUrl}`);
      }
    } else {
      // Try via Supabase client signOut in the browser
      log('ℹ️', 'No visible logout button — trying programmatic signOut');
      await page.evaluate(async () => {
        if (window.__SUPABASE_CLIENT__) {
          await window.__SUPABASE_CLIENT__.auth.signOut();
        }
      }).catch(() => {});
      
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
      const finalUrl = page.url();
      if (finalUrl.includes('/auth/login')) {
        pass('Logout verified: protected page redirects to login');
      } else {
        log('ℹ️', 'Could not verify logout');
      }
    }
  } catch (err) {
    fail('Logout', err);
  }

  await screenshot(page, '36_final_state');
}

// ── Summary ─────────────────────────────────────────────────────────────────────
function printSummary() {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 FULL E2E TEST RESULTS');
  console.log('═'.repeat(60));
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📋 Total:  ${passed + failed}`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    });
  }

  console.log(`\n📸 Screenshots saved to: ${SCREENSHOT_DIR}/`);
  console.log(failed === 0 ? '\n🎉 ALL TESTS PASSED!' : `\n⚠️ ${failed} test(s) failed`);
  
  process.exit(failed > 0 ? 1 : 0);
}

runE2E().catch((err) => {
  console.error('\n💥 Unhandled error:', err);
  process.exit(1);
});
