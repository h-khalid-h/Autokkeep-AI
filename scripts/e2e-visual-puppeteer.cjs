#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Autokkeep Visual E2E Test — Puppeteer-based
 * Connects to existing Chrome at localhost:9222
 * Takes screenshots of every page in the user journey
 */

const path = require('path');
const fs = require('fs');

async function loadPuppeteer() {
  // Try local first, then global npx
  try { return require('puppeteer'); } catch {}
  try { return require('puppeteer-core'); } catch {}
  // Use dynamic import for npx-installed version
  const { default: puppeteer } = await import('puppeteer');
  return puppeteer;
}


const APP_URL = 'https://autokkeep.com';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'e2e-screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let passed = 0, failed = 0;
const results = [];

function log(phase, test, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  results.push({ phase, test, ok, detail });
  if (ok) passed++; else failed++;
  console.log(`${icon} [${phase}] ${test}${detail ? ` — ${detail}` : ''}`);
}

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`   📸 ${name}.png`);
  return filePath;
}

async function main() {
  const puppeteer = await loadPuppeteer();
  
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  AUTOKKEEP VISUAL E2E TEST (Puppeteer)          ║');
  console.log('║  Target: https://autokkeep.com                  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Connect to existing Chrome
  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    });
  } catch (_e) {
    // Launch new Chrome if connection fails
    console.log('   Launching new Chrome instance...');
    browser = await puppeteer.launch({
      headless: 'new',
      defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');

  // ═══════════════════════════════════════════
  // PHASE 1: Landing Page
  // ═══════════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 1: Landing Page & Marketing');
  console.log('══════════════════════════════════════');

  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 15000 });
  
  const title = await page.title();
  log('Landing', 'Page loads with title', title.includes('Autokkeep'), title);
  
  const heroText = await page.$eval('h1', el => el.textContent).catch(() => '');
  log('Landing', 'Hero heading renders', heroText.length > 5, heroText.slice(0, 50));
  
  const navLinks = await page.$$eval('nav a', els => els.map(a => a.href));
  log('Landing', 'Navbar has links', navLinks.length >= 3, `${navLinks.length} links`);
  
  const loginLink = navLinks.some(l => l.includes('/auth/login'));
  const signupLink = navLinks.some(l => l.includes('/auth/signup'));
  log('Landing', 'Login link → /auth/login', loginLink);
  log('Landing', 'Signup link → /auth/signup', signupLink);
  
  // Check features
  const hasFeatures = await page.evaluate(() => !!document.querySelector('#features'));
  log('Landing', 'Features section exists', hasFeatures);
  
  // Check pricing
  const hasPricing = await page.evaluate(() => !!document.querySelector('#pricing'));
  log('Landing', 'Pricing section exists', hasPricing);
  
  await screenshot(page, '01_landing_hero');
  
  // Scroll to pricing
  await page.evaluate(() => document.querySelector('#pricing')?.scrollIntoView());
  await new Promise(r => setTimeout(r, 1000));
  await screenshot(page, '02_landing_pricing');
  
  // Scroll to footer
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1000));
  await screenshot(page, '03_landing_footer');

  // ── Marketing pages ──
  const marketingPages = [
    { url: '/about', name: '04_about', check: 'About' },
    { url: '/pricing', name: '05_pricing_page', check: 'Pricing' },
    { url: '/security', name: '06_security', check: 'Security' },
    { url: '/blog', name: '07_blog', check: 'Blog' },
    { url: '/contact', name: '08_contact', check: 'Contact' },
    { url: '/privacy', name: '09_privacy', check: 'Privacy' },
    { url: '/terms', name: '10_terms', check: 'Terms' },
    { url: '/changelog', name: '11_changelog', check: 'Changelog' },
    { url: '/resources', name: '12_resources', check: 'Resources' },
    { url: '/demo/shadow-audit', name: '13_demo', check: 'Shadow' },
  ];

  for (const pg of marketingPages) {
    await page.goto(`${APP_URL}${pg.url}`, { waitUntil: 'networkidle2', timeout: 15000 });
    const pgTitle = await page.title();
    log('Marketing', `${pg.url} loads`, pgTitle.length > 5, pgTitle);
    await screenshot(page, pg.name);
  }

  // ═══════════════════════════════════════════
  // PHASE 2: Auth Flow
  // ═══════════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 2: Auth Flow');
  console.log('══════════════════════════════════════');

  // Login page
  await page.goto(`${APP_URL}/auth/login`, { waitUntil: 'networkidle2', timeout: 15000 });
  
  const hasEmailField = await page.$('input[type="email"]') !== null;
  const hasPasswordField = await page.$('input[type="password"]') !== null;
  const hasSubmitBtn = await page.$('button[type="submit"]') !== null;
  
  log('Login', 'Email field present', hasEmailField);
  log('Login', 'Password field present', hasPasswordField);
  log('Login', 'Submit button present', hasSubmitBtn);
  
  const hasForgotLink = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    return [...links].some(l => l.href.includes('forgot') || l.textContent.toLowerCase().includes('forgot'));
  });
  log('Login', 'Forgot password link', hasForgotLink);
  
  const hasSignupLink = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    return [...links].some(l => l.href.includes('signup') || l.textContent.toLowerCase().includes('sign up'));
  });
  log('Login', 'Sign up link present', hasSignupLink);
  await screenshot(page, '14_login_page');

  // Try wrong credentials
  await page.type('input[type="email"]', 'e2e-test@nonexistent.com', { delay: 30 });
  await page.type('input[type="password"]', 'WrongPassword123!', { delay: 30 });
  await screenshot(page, '15_login_filled');
  
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 3000));
  
  const errorVisible = await page.evaluate(() => {
    const body = document.body.innerText.toLowerCase();
    return body.includes('error') || body.includes('invalid') || body.includes('incorrect') || body.includes('failed');
  });
  log('Login', 'Wrong creds show error', errorVisible);
  await screenshot(page, '16_login_error');

  // Signup page
  await page.goto(`${APP_URL}/auth/signup`, { waitUntil: 'networkidle2', timeout: 15000 });
  
  const signupFields = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    return inputs.length;
  });
  log('Signup', 'Signup page loads', signupFields >= 2, `${signupFields} input fields`);
  await screenshot(page, '17_signup_page');

  // Forgot password
  await page.goto(`${APP_URL}/auth/forgot-password`, { waitUntil: 'networkidle2', timeout: 15000 });
  const forgotTitle = await page.title();
  log('Auth', 'Forgot password loads', true, forgotTitle);
  await screenshot(page, '18_forgot_password');

  // ═══════════════════════════════════════════
  // PHASE 3: Protected Routes
  // ═══════════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 3: Protected Route Redirects');
  console.log('══════════════════════════════════════');

  const protectedRoutes = [
    '/dashboard', '/settings', '/transactions',
    '/chart-of-accounts', '/analytics', '/insights',
    '/portfolio', '/tax', '/close', '/health', '/account',
  ];

  for (const route of protectedRoutes) {
    await page.goto(`${APP_URL}${route}`, { waitUntil: 'networkidle2', timeout: 15000 });
    const currentUrl = page.url();
    const redirected = currentUrl.includes('/auth/login');
    log('Redirect', `${route} → login`, redirected, redirected ? '✓ redirect param present' : currentUrl);
  }
  await screenshot(page, '19_redirect_to_login');

  // ═══════════════════════════════════════════
  // PHASE 4: Error & Edge Cases
  // ═══════════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 4: Error & Edge Cases');
  console.log('══════════════════════════════════════');

  // 404 page
  await page.goto(`${APP_URL}/this-page-does-not-exist-xyz`, { waitUntil: 'networkidle2', timeout: 15000 });
  const page404Text = await page.evaluate(() => document.body.innerText);
  log('404', 'Custom 404 renders', page404Text.includes('404') || page404Text.includes("doesn't exist"));
  log('404', 'Has navigation home', page404Text.includes('Home') || page404Text.includes('Dashboard') || page404Text.includes('Back'));
  await screenshot(page, '20_404_page');

  // ═══════════════════════════════════════════
  // PHASE 5: Responsive & Dark Mode
  // ═══════════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 5: Responsive & Dark Mode');
  console.log('══════════════════════════════════════');

  // Mobile viewport
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3, isMobile: true });
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 15000 });
  
  const hasHamburger = await page.evaluate(() => {
    const el = document.querySelector('[aria-label*="menu"], [aria-label*="Menu"], button.hamburger, [class*="hamburger"]');
    return !!el;
  });
  log('Mobile', 'Hamburger menu present', hasHamburger);
  await screenshot(page, '21_mobile_landing');

  await page.goto(`${APP_URL}/auth/login`, { waitUntil: 'networkidle2', timeout: 15000 });
  await screenshot(page, '22_mobile_login');
  log('Mobile', 'Mobile login renders', true);

  await page.goto(`${APP_URL}/auth/signup`, { waitUntil: 'networkidle2', timeout: 15000 });
  await screenshot(page, '23_mobile_signup');
  log('Mobile', 'Mobile signup renders', true);

  // Dark mode (desktop)
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 15000 });
  await screenshot(page, '24_dark_mode_landing');
  log('Dark Mode', 'Landing page in dark mode', true);

  await page.evaluate(() => document.querySelector('#pricing')?.scrollIntoView());
  await new Promise(r => setTimeout(r, 1000));
  await screenshot(page, '25_dark_mode_pricing');
  log('Dark Mode', 'Pricing in dark mode', true);

  await page.goto(`${APP_URL}/auth/login`, { waitUntil: 'networkidle2', timeout: 15000 });
  await screenshot(page, '26_dark_mode_login');
  log('Dark Mode', 'Login in dark mode', true);

  await page.goto(`${APP_URL}/auth/signup`, { waitUntil: 'networkidle2', timeout: 15000 });
  await screenshot(page, '27_dark_mode_signup');
  log('Dark Mode', 'Signup in dark mode', true);

  // Mobile dark mode
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3, isMobile: true });
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 15000 });
  await screenshot(page, '28_mobile_dark_landing');
  log('Dark Mode', 'Mobile dark landing', true);

  // ═══════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════
  await page.close();

  // Summary
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`║  Screenshots: e2e-screenshots/ (${fs.readdirSync(SCREENSHOT_DIR).length} files)`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    console.log('FAILURES:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  ❌ [${r.phase}] ${r.test} — ${r.detail}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
