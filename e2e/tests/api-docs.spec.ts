import { test, expect } from '@playwright/test';

test.describe('Developer Docs / API Documentation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/developers');
  });

  test('/developers page loads', async ({ page }) => {
    // Should load without errors (may redirect if auth-gated)
    const url = page.url();
    if (url.includes('/auth/login')) {
      test.skip(true, 'Developers page requires authentication');
      return;
    }

    // Page should have loaded with content
    await expect(page).toHaveURL(/\/developers/);
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    // Should have a heading
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('sidebar navigation present', async ({ page }) => {
    const url = page.url();
    if (url.includes('/auth/login')) {
      test.skip(true, 'Developers page requires authentication');
      return;
    }

    // Look for sidebar/navigation structure
    const sidebar = page.locator(
      'nav, aside, [role="navigation"], [data-testid="sidebar"], .sidebar'
    ).first();

    await expect(sidebar).toBeVisible();

    // Sidebar should contain navigation links or items
    const navItems = sidebar.locator('a, button, [role="menuitem"]');
    const count = await navItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('can click endpoint cards', async ({ page }) => {
    const url = page.url();
    if (url.includes('/auth/login')) {
      test.skip(true, 'Developers page requires authentication');
      return;
    }

    // Look for API endpoint cards or list items
    const endpointCards = page.locator(
      '[data-testid*="endpoint"], .endpoint-card, [class*="endpoint"], a:has-text("/api/"), button:has-text("/api/")'
    );

    const count = await endpointCards.count();
    if (count > 0) {
      // Click the first endpoint card
      const firstCard = endpointCards.first();
      await expect(firstCard).toBeVisible();
      await firstCard.click();

      // After clicking, endpoint details should be revealed
      // Look for method badges, descriptions, or expanded content
      const detail = page.locator(
        'text=/GET|POST|PUT|PATCH|DELETE/i, code, pre, [data-testid*="detail"]'
      ).first();
      await expect(detail).toBeVisible({ timeout: 5_000 });
    }
  });

  test('code examples render', async ({ page }) => {
    const url = page.url();
    if (url.includes('/auth/login')) {
      test.skip(true, 'Developers page requires authentication');
      return;
    }

    // Look for code blocks (pre/code elements or syntax-highlighted blocks)
    const codeBlocks = page.locator('pre, code, [class*="code"], [data-testid*="code"]');
    const count = await codeBlocks.count();

    // Developer docs should have at least one code example
    expect(count).toBeGreaterThan(0);

    // First code block should contain meaningful content
    const firstBlock = codeBlocks.first();
    await expect(firstBlock).toBeVisible();
    const text = await firstBlock.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('rate limits table visible', async ({ page }) => {
    const url = page.url();
    if (url.includes('/auth/login')) {
      test.skip(true, 'Developers page requires authentication');
      return;
    }

    // Look for rate limits section — could be a table or a structured list
    const rateLimitsSection = page.locator(
      'text=/rate.?limit/i, [data-testid*="rate"], h2:has-text("Rate"), h3:has-text("Rate")'
    ).first();

    if (await rateLimitsSection.isVisible()) {
      // If there's a rate limits section, it should have tabular data or list items
      const table = page.locator('table').first();
      const listItems = page.locator('[class*="rate"] li, [data-testid*="rate"] li');

      const hasTable = await table.isVisible().catch(() => false);
      const hasList = (await listItems.count()) > 0;

      expect(hasTable || hasList).toBe(true);
    }
  });
});
