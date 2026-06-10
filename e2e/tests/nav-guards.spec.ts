import { test, expect } from '@playwright/test';

test.describe('App Navigation & Auth Guards', () => {
  test.describe('Protected Route Redirects', () => {
    const protectedRoutes = [
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/transactions', label: 'Transactions' },
      { path: '/analytics', label: 'Analytics' },
      { path: '/reports', label: 'Reports' },
      { path: '/settings', label: 'Settings' },
      { path: '/health', label: 'Health' },
      { path: '/tax', label: 'Tax' },
    ];

    for (const route of protectedRoutes) {
      test(`${route.label} (${route.path}) redirects to login if not authenticated`, async ({ page }) => {
        await page.goto(route.path);

        // Should redirect to the login page
        await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
      });
    }
  });

  test.describe('Additional Protected Routes', () => {
    const additionalProtectedRoutes = [
      { path: '/audit', label: 'Audit' },
      { path: '/insights', label: 'Insights' },
      { path: '/notifications', label: 'Notifications' },
      { path: '/portfolio', label: 'Portfolio' },
      { path: '/chart-of-accounts', label: 'Chart of Accounts' },
      { path: '/vendors', label: 'Vendors' },
      { path: '/account', label: 'Account' },
    ];

    for (const route of additionalProtectedRoutes) {
      test(`${route.label} (${route.path}) redirects to login if not authenticated`, async ({ page }) => {
        await page.goto(route.path);

        // Should redirect to the login page
        await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
      });
    }
  });

  test.describe('404 Page', () => {
    test('unknown route renders 404 page', async ({ page }) => {
      await page.goto('/this-route-does-not-exist-abc123');

      // Should display a 404 indicator
      await expect(page.getByText('404')).toBeVisible();
    });

    test('404 page has helpful content', async ({ page }) => {
      await page.goto('/this-route-does-not-exist-abc123');

      // Should have a heading about the page not existing
      await expect(page.getByText(/doesn.*t exist|not found/i)).toBeVisible();

      // Should have a "Back to Home" link
      const homeLink = page.getByRole('link', { name: /back to home/i });
      await expect(homeLink).toBeVisible();
    });

    test('404 page has link back to dashboard', async ({ page }) => {
      await page.goto('/this-route-does-not-exist-abc123');

      const dashboardLink = page.getByRole('link', { name: /dashboard/i });
      await expect(dashboardLink).toBeVisible();
      await expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    });

    test('404 Back to Home link navigates to landing page', async ({ page }) => {
      await page.goto('/this-route-does-not-exist-abc123');

      const homeLink = page.getByRole('link', { name: /back to home/i });
      await homeLink.click();

      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Public Routes Are Accessible', () => {
    const publicRoutes = [
      { path: '/', label: 'Landing Page' },
      { path: '/auth/login', label: 'Login Page' },
      { path: '/auth/signup', label: 'Signup Page' },
      { path: '/auth/forgot-password', label: 'Forgot Password' },
      { path: '/about', label: 'About Page' },
      { path: '/privacy', label: 'Privacy Policy' },
      { path: '/terms', label: 'Terms of Service' },
      { path: '/contact', label: 'Contact Page' },
    ];

    for (const route of publicRoutes) {
      test(`${route.label} (${route.path}) loads without redirecting to login`, async ({ page }) => {
        await page.goto(route.path);

        // Should NOT be redirected to the login page
        // (except if we're already on the login page)
        if (route.path !== '/auth/login') {
          // Give the page time to potentially redirect
          await page.waitForTimeout(2000);
          const currentUrl = page.url();
          expect(currentUrl).not.toMatch(/\/auth\/login/);
        }

        // Page should have loaded with a response (not blank)
        const body = page.locator('body');
        await expect(body).not.toBeEmpty();
      });
    }
  });
});
