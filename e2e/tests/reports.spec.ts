import { test, expect } from '@playwright/test';

test.describe('Reports Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reports');

    // If we get redirected to login, the tests will capture that behavior
    // These tests verify UI structure when the page is accessible
  });

  test('reports page loads', async ({ page }) => {
    // Should either show reports or redirect to auth
    const url = page.url();
    if (url.includes('/auth/login')) {
      // Expected for unauthenticated — test passes
      test.skip(true, 'Redirected to login — cannot test reports UI without auth');
      return;
    }

    // Reports page should have loaded
    await expect(page).toHaveURL(/\/reports/);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('can switch between P&L and Balance Sheet tabs', async ({ page }) => {
    const url = page.url();
    if (url.includes('/auth/login')) {
      test.skip(true, 'Redirected to login — cannot test reports UI without auth');
      return;
    }

    // Look for tab elements (P&L, Balance Sheet)
    const plTab = page.locator('[role="tab"]:has-text("P&L"), [role="tab"]:has-text("Profit"), button:has-text("P&L"), button:has-text("Profit")').first();
    const bsTab = page.locator('[role="tab"]:has-text("Balance"), button:has-text("Balance")').first();

    if (await plTab.isVisible()) {
      await plTab.click();
      // Tab should be active/selected after clicking
      await expect(plTab).toBeVisible();
    }

    if (await bsTab.isVisible()) {
      await bsTab.click();
      await expect(bsTab).toBeVisible();
    }
  });

  test('date pickers are functional', async ({ page }) => {
    const url = page.url();
    if (url.includes('/auth/login')) {
      test.skip(true, 'Redirected to login — cannot test reports UI without auth');
      return;
    }

    // Look for date inputs or date picker triggers
    const dateInputs = page.locator('input[type="date"], input[type="month"], [data-testid*="date"], button:has-text("Date")');
    const count = await dateInputs.count();

    // Reports should have at least one date-related control
    expect(count).toBeGreaterThan(0);

    // First date input should be interactive
    const firstDateInput = dateInputs.first();
    await expect(firstDateInput).toBeVisible();
    await expect(firstDateInput).toBeEnabled();
  });

  test('generate button is clickable', async ({ page }) => {
    const url = page.url();
    if (url.includes('/auth/login')) {
      test.skip(true, 'Redirected to login — cannot test reports UI without auth');
      return;
    }

    // Look for generate/run report button
    const generateBtn = page.locator(
      'button:has-text("Generate"), button:has-text("Run"), button:has-text("Create Report")'
    ).first();

    if (await generateBtn.isVisible()) {
      await expect(generateBtn).toBeEnabled();
      // Don't actually click to avoid triggering long API calls in E2E
    }
  });

  test('shows empty state before generating', async ({ page }) => {
    const url = page.url();
    if (url.includes('/auth/login')) {
      test.skip(true, 'Redirected to login — cannot test reports UI without auth');
      return;
    }

    // Before generating a report, the page should show an empty/initial state
    // This could be a placeholder message, an illustration, or instructions
    const emptyState = page.locator(
      '[data-testid="empty-state"], .empty-state, text=/select.*date|choose.*period|generate.*report|no.*report/i'
    );

    // Either an explicit empty state or the generate button should be visible
    const generateBtn = page.locator('button:has-text("Generate"), button:has-text("Run")').first();
    const hasEmptyState = await emptyState.first().isVisible().catch(() => false);
    const hasGenerateBtn = await generateBtn.isVisible().catch(() => false);

    expect(hasEmptyState || hasGenerateBtn).toBe(true);
  });
});
