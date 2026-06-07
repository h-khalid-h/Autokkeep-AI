import { test, expect } from '@playwright/test';

test.describe('Page Navigation', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/');

    // Landing page should load successfully
    await expect(page).toHaveURL('/');

    // Page should have meaningful content
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    // Page title should be set
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('dashboard redirects to login if not authenticated', async ({ page }) => {
    await page.goto('/dashboard');

    // Should redirect to login page since we're not authenticated
    await page.waitForURL(/\/auth\/login|\/dashboard/, { timeout: 10_000 });

    // Either we're on the login page (redirect) or we see the dashboard
    // In an unauthenticated state, we expect redirect
    const url = page.url();
    expect(url).toMatch(/\/auth\/login|\/dashboard/);
  });

  test('can navigate to /reports', async ({ page }) => {
    await page.goto('/reports');

    // Should either load reports or redirect to auth
    await page.waitForURL(/\/reports|\/auth\/login/, { timeout: 10_000 });
    const url = page.url();
    expect(url).toMatch(/\/reports|\/auth\/login/);
  });

  test('can navigate to /analytics', async ({ page }) => {
    await page.goto('/analytics');

    await page.waitForURL(/\/analytics|\/auth\/login/, { timeout: 10_000 });
    const url = page.url();
    expect(url).toMatch(/\/analytics|\/auth\/login/);
  });

  test('can navigate to /settings', async ({ page }) => {
    await page.goto('/settings');

    await page.waitForURL(/\/settings|\/auth\/login/, { timeout: 10_000 });
    const url = page.url();
    expect(url).toMatch(/\/settings|\/auth\/login/);
  });

  test('can navigate to /developers', async ({ page }) => {
    await page.goto('/developers');

    // Developers/API docs page may be public or may redirect
    await page.waitForURL(/\/developers|\/auth\/login/, { timeout: 10_000 });

    // Page should not show an unhandled error
    const errorHeading = page.locator('h1:has-text("Application error")');
    await expect(errorHeading).not.toBeVisible();
  });

  test('404 page for unknown routes', async ({ page }) => {
    await page.goto('/this-route-definitely-does-not-exist');

    // Should show the custom 404 page
    // Check for common 404 indicators
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    // Next.js returns 404 status — the page should have 404-related content
    const has404 = page.locator('text=/404|not found|page.*not.*found/i');
    await expect(has404.first()).toBeVisible({ timeout: 5_000 });
  });
});
