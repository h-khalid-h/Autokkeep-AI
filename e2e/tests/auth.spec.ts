import { test, expect } from '@playwright/test';

test.describe('Authentication Flows', () => {
  test.describe('Login Page', () => {
    test('login page renders correctly', async ({ page }) => {
      await page.goto('/auth/login');

      // Page should have loaded without errors
      await expect(page).toHaveURL(/\/auth\/login/);

      // Core form elements should be visible
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
      await expect(page.getByRole('button', { name: /log\s?in|sign\s?in/i })).toBeVisible();
    });

    test('can navigate to signup from login', async ({ page }) => {
      await page.goto('/auth/login');

      // Find and click sign-up link
      const signupLink = page.getByRole('link', { name: /sign\s?up|create|register/i });
      await expect(signupLink).toBeVisible();
      await signupLink.click();

      await expect(page).toHaveURL(/\/auth\/signup/);
    });

    test('shows error for invalid credentials', async ({ page }) => {
      await page.goto('/auth/login');

      // Fill in invalid credentials
      await page.locator('input[type="email"], input[name="email"]').fill('invalid@example.com');
      await page.locator('input[type="password"], input[name="password"]').fill('wrongpassword123');

      // Submit the form
      await page.getByRole('button', { name: /log\s?in|sign\s?in/i }).click();

      // Should show an error message (not navigate to dashboard)
      const errorElement = page.locator('[role="alert"], .error, [data-testid="error-message"]');
      await expect(errorElement).toBeVisible({ timeout: 10_000 });
    });

    test('login form validates empty fields', async ({ page }) => {
      await page.goto('/auth/login');

      // Click submit without filling anything
      await page.getByRole('button', { name: /log\s?in|sign\s?in/i }).click();

      // Should still be on login page (form validation prevents submission)
      await expect(page).toHaveURL(/\/auth\/login/);

      // Either HTML5 validation or custom error should be present
      // Check that we haven't navigated away
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      await expect(emailInput).toBeVisible();
    });
  });
});
