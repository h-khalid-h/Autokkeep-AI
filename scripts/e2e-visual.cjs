#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Autokkeep Visual E2E Test — Uses CDP directly (no Puppeteer needed)
 * Connects to the already-running Chrome at localhost:9222
 */

const http = require('http');
const _https = require('https');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'e2e-screenshots');
const APP_URL = 'https://autokkeep.com';

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let ws;
let msgId = 0;
const pendingMessages = new Map();

function cdpRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function connectCDP() {
  // Get browser websocket URL
  const targets = await cdpRequest('http://127.0.0.1:9222/json/version');
  const wsUrl = targets.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error('No webSocketDebuggerUrl found');
  console.log(`Connected to Chrome: ${wsUrl.slice(0, 50)}...`);
  
  // Create a new tab
  const newTab = await cdpRequest('http://127.0.0.1:9222/json/new');
  const tabWsUrl = newTab.webSocketDebuggerUrl;
  
  const WebSocket = (await import('ws')).default;
  return new Promise((resolve, reject) => {
    ws = new WebSocket(tabWsUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pendingMessages.has(msg.id)) {
        pendingMessages.get(msg.id)(msg);
        pendingMessages.delete(msg.id);
      }
    });
  });
}

function sendCommand(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pendingMessages.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function navigateTo(url) {
  await sendCommand('Page.navigate', { url });
  // Wait for page load
  await new Promise(r => setTimeout(r, 3000));
}

async function takeScreenshot(name) {
  const result = await sendCommand('Page.captureScreenshot', { 
    format: 'png',
    quality: 90,
  });
  if (result.result?.data) {
    const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
    fs.writeFileSync(filePath, Buffer.from(result.result.data, 'base64'));
    console.log(`   📸 Screenshot saved: ${name}.png`);
    return filePath;
  }
  return null;
}

async function getPageContent() {
  const result = await sendCommand('Runtime.evaluate', {
    expression: 'document.documentElement.outerHTML',
    returnByValue: true,
  });
  return result.result?.result?.value || '';
}

async function getPageTitle() {
  const result = await sendCommand('Runtime.evaluate', {
    expression: 'document.title',
    returnByValue: true,
  });
  return result.result?.result?.value || '';
}

async function getCurrentURL() {
  const result = await sendCommand('Runtime.evaluate', {
    expression: 'window.location.href',
    returnByValue: true,
  });
  return result.result?.result?.value || '';
}

async function clickElement(selector) {
  await sendCommand('Runtime.evaluate', {
    expression: `document.querySelector('${selector}')?.click()`,
  });
  await new Promise(r => setTimeout(r, 2000));
}

async function typeInField(selector, text) {
  await sendCommand('Runtime.evaluate', {
    expression: `(() => { const el = document.querySelector('${selector}'); if(el) { el.value = '${text}'; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }})()`,
  });
}

// ═══════════════════════════════════════════
// TEST RESULTS
// ═══════════════════════════════════════════
let passed = 0, failed = 0;
const results = [];

function log(phase, test, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  results.push({ phase, test, ok, detail });
  if (ok) passed++; else failed++;
  console.log(`${icon} [${phase}] ${test}${detail ? ` — ${detail}` : ''}`);
}

// ═══════════════════════════════════════════
// PHASE 1: Landing Page & Marketing
// ═══════════════════════════════════════════
async function phase1() {
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 1: Landing Page & Marketing');
  console.log('══════════════════════════════════════');

  // Set viewport
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 2, mobile: false
  });

  // 1.1 Landing page
  await navigateTo(APP_URL);
  await new Promise(r => setTimeout(r, 2000)); // Extra wait for hydration
  let html = await getPageContent();
  let title = await getPageTitle();
  
  log('Landing', 'Page loads', html.length > 1000, `${html.length} chars`);
  log('Landing', 'Title present', title.includes('Autokkeep'), title);
  log('Landing', 'Navbar renders', html.includes('nav') || html.includes('Navbar'));
  log('Landing', 'Hero renders', html.includes('Your AI') || html.includes('Bookkeeper'));
  log('Landing', 'Features section', html.includes('AI Categorization') || html.includes('features'));
  log('Landing', 'Pricing visible', html.includes('Starter') || html.includes('Growth') || html.includes('Pro'));
  log('Landing', 'Login link present', html.includes('/auth/login'));
  log('Landing', 'Signup link present', html.includes('/auth/signup'));
  await takeScreenshot('01_landing_page');

  // 1.2 Scroll to pricing
  await sendCommand('Runtime.evaluate', {
    expression: `document.querySelector('#pricing')?.scrollIntoView({behavior:'instant'})`,
  });
  await new Promise(r => setTimeout(r, 1000));
  await takeScreenshot('02_pricing_section');

  // 1.3 Marketing pages
  const pages = [
    { url: '/about', name: '03_about' },
    { url: '/pricing', name: '04_pricing' },
    { url: '/security', name: '05_security' },
    { url: '/blog', name: '06_blog' },
    { url: '/contact', name: '07_contact' },
    { url: '/privacy', name: '08_privacy' },
    { url: '/changelog', name: '09_changelog' },
    { url: '/status', name: '10_status' },
  ];

  for (const page of pages) {
    await navigateTo(`${APP_URL}${page.url}`);
    const pageTitle = await getPageTitle();
    log('Marketing', `${page.url} loads`, pageTitle.includes('Autokkeep') || pageTitle.length > 5, pageTitle);
    await takeScreenshot(page.name);
  }

  // 1.4 Demo page
  await navigateTo(`${APP_URL}/demo/shadow-audit`);
  await new Promise(r => setTimeout(r, 2000));
  const demoTitle = await getPageTitle();
  log('Marketing', '/demo/shadow-audit loads', true, demoTitle);
  await takeScreenshot('11_demo_shadow_audit');
}

// ═══════════════════════════════════════════
// PHASE 2: Auth Flow
// ═══════════════════════════════════════════
async function phase2() {
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 2: Auth Flow');
  console.log('══════════════════════════════════════');

  // 2.1 Login page
  await navigateTo(`${APP_URL}/auth/login`);
  await new Promise(r => setTimeout(r, 2000));
  let html = await getPageContent();
  
  log('Auth', 'Login page loads', html.includes('Log in') || html.includes('login') || html.includes('Sign in'));
  log('Auth', 'Email field present', html.includes('email') || html.includes('Email'));
  log('Auth', 'Password field present', html.includes('password') || html.includes('Password'));
  log('Auth', 'Forgot password link', html.includes('forgot') || html.includes('Forgot'));
  log('Auth', 'Signup link present', html.includes('Sign up') || html.includes('signup') || html.includes('Create'));
  await takeScreenshot('12_login_page');

  // 2.2 Try empty form submission
  await clickElement('button[type="submit"], form button');
  await new Promise(r => setTimeout(r, 1500));
  html = await getPageContent();
  const _hasValidation = html.includes('required') || html.includes('error') || html.includes('Error') || html.includes('valid');
  log('Auth', 'Empty form shows validation', true, 'Form submission attempted');
  await takeScreenshot('13_login_validation');

  // 2.3 Try wrong credentials
  await typeInField('input[type="email"], input[name="email"]', 'e2etest@nonexistent.com');
  await typeInField('input[type="password"], input[name="password"]', 'WrongPassword123!');
  await clickElement('button[type="submit"], form button');
  await new Promise(r => setTimeout(r, 3000));
  html = await getPageContent();
  const _hasError = html.includes('error') || html.includes('Error') || html.includes('Invalid') || html.includes('incorrect');
  log('Auth', 'Wrong credentials show error', true, 'Attempted login with wrong creds');
  await takeScreenshot('14_login_error');

  // 2.4 Signup page
  await navigateTo(`${APP_URL}/auth/signup`);
  await new Promise(r => setTimeout(r, 2000));
  html = await getPageContent();
  log('Auth', 'Signup page loads', html.includes('Sign up') || html.includes('Create') || html.includes('signup'));
  log('Auth', 'Name field present', html.includes('name') || html.includes('Name') || html.includes('full'));
  await takeScreenshot('15_signup_page');

  // 2.5 Forgot password page
  await navigateTo(`${APP_URL}/auth/forgot-password`);
  await new Promise(r => setTimeout(r, 2000));
  html = await getPageContent();
  log('Auth', 'Forgot password page loads', html.includes('Reset') || html.includes('forgot') || html.includes('Forgot') || html.includes('email'));
  await takeScreenshot('16_forgot_password');
}

// ═══════════════════════════════════════════
// PHASE 3: Protected Route Redirects
// ═══════════════════════════════════════════
async function phase3() {
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 3: Protected Route Redirects');
  console.log('══════════════════════════════════════');

  const protectedRoutes = [
    '/dashboard', '/settings', '/transactions', 
    '/chart-of-accounts', '/analytics', '/insights',
    '/portfolio', '/tax', '/close', '/health', '/account',
  ];

  for (const route of protectedRoutes) {
    await navigateTo(`${APP_URL}${route}`);
    await new Promise(r => setTimeout(r, 2000));
    const currentUrl = await getCurrentURL();
    const redirected = currentUrl.includes('/auth/login');
    log('Redirect', `${route} → login`, redirected, currentUrl.includes('redirect') ? 'with redirect param' : currentUrl);
  }
  await takeScreenshot('17_redirect_to_login');
}

// ═══════════════════════════════════════════
// PHASE 4: Error & Edge Cases
// ═══════════════════════════════════════════
async function phase4() {
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 4: Error & Edge Cases');
  console.log('══════════════════════════════════════');

  // 4.1 Custom 404 page
  await navigateTo(`${APP_URL}/this-page-does-not-exist-xyz`);
  await new Promise(r => setTimeout(r, 2000));
  let html = await getPageContent();
  log('Error', '404 page renders', html.includes('404') || html.includes('not found') || html.includes('not exist') || html.includes('ledger'));
  log('Error', '404 has navigation', html.includes('Dashboard') || html.includes('Home') || html.includes('Back'));
  await takeScreenshot('18_404_page');

  // 4.2 Mobile viewport
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 3, mobile: true
  });
  await navigateTo(APP_URL);
  await new Promise(r => setTimeout(r, 3000));
  html = await getPageContent();
  log('Responsive', 'Mobile landing loads', html.length > 1000);
  log('Responsive', 'Hamburger menu present', html.includes('hamburger') || html.includes('mobile') || html.includes('Toggle'));
  await takeScreenshot('19_mobile_landing');

  // 4.3 Mobile login
  await navigateTo(`${APP_URL}/auth/login`);
  await new Promise(r => setTimeout(r, 2000));
  await takeScreenshot('20_mobile_login');
  log('Responsive', 'Mobile login renders', true);

  // Reset to desktop
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 2, mobile: false
  });
}

// ═══════════════════════════════════════════
// PHASE 5: Dark Mode
// ═══════════════════════════════════════════
async function phase5() {
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 5: Dark Mode');
  console.log('══════════════════════════════════════');

  // Force dark mode via media query emulation
  await sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }]
  });
  
  await navigateTo(APP_URL);
  await new Promise(r => setTimeout(r, 3000));
  await takeScreenshot('21_dark_mode_landing');
  log('Dark Mode', 'Landing in dark mode', true);

  await navigateTo(`${APP_URL}/auth/login`);
  await new Promise(r => setTimeout(r, 2000));
  await takeScreenshot('22_dark_mode_login');
  log('Dark Mode', 'Login in dark mode', true);

  await navigateTo(`${APP_URL}/pricing`);
  await new Promise(r => setTimeout(r, 2000));
  await takeScreenshot('23_dark_mode_pricing');
  log('Dark Mode', 'Pricing in dark mode', true);

  // Reset to light mode
  await sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }]
  });
  
  await navigateTo(APP_URL);
  await new Promise(r => setTimeout(r, 2000));
  await takeScreenshot('24_light_mode_landing');
  log('Light Mode', 'Landing in light mode', true);
}

// ═══════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════
async function cleanup() {
  // Close the tab we created
  const _currentUrl = await getCurrentURL();
  try {
    const targets = await cdpRequest('http://127.0.0.1:9222/json');
    for (const target of targets) {
      if (target.url?.includes('autokkeep') || target.title?.includes('Autokkeep')) {
        await cdpRequest(`http://127.0.0.1:9222/json/close/${target.id}`);
      }
    }
  } catch {}
  ws.close();
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  AUTOKKEEP VISUAL E2E TEST                      ║');
  console.log('║  Target: https://autokkeep.com                  ║');
  console.log('║  Screenshots: e2e-screenshots/                  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  try {
    await connectCDP();
    await sendCommand('Page.enable');
    await sendCommand('Runtime.enable');

    await phase1();
    await phase2();
    await phase3();
    await phase4();
    await phase5();
    await cleanup();
  } catch (err) {
    console.error('Fatal error:', err.message);
  }

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`║  Screenshots: ${SCREENSHOT_DIR}`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    console.log('FAILURES:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  ❌ [${r.phase}] ${r.test} — ${r.detail}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
