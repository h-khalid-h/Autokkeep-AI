/**
 * Playwright global setup — runs once before all test suites.
 * Verifies the application is running and accessible.
 */
async function globalSetup() {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  const maxRetries = 5;
  const retryDelay = 2000;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Autokkeep E2E — Global Setup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Base URL: ${baseURL}`);
  console.log(`  Started:  ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Verify app is reachable
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseURL}/api/health`);
      if (res.ok) {
        console.log(`  ✓ App is reachable (attempt ${attempt}/${maxRetries})`);
        return;
      }
      console.warn(`  ⚠ Health check returned ${res.status} (attempt ${attempt}/${maxRetries})`);
    } catch (err) {
      console.warn(`  ⚠ App unreachable (attempt ${attempt}/${maxRetries}):`, (err as Error).message);
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, retryDelay));
    }
  }

  // If we're using the webServer config, Playwright will have started it —
  // don't fail hard, just warn so tests can report actual failures.
  console.warn('  ⚠ Could not confirm app is healthy — proceeding anyway.\n');
}

export default globalSetup;
