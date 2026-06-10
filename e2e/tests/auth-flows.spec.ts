import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.describe('Login Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login');
    });

    test('login page loads correctly', async ({ page }) => {
      await expect(page).toHaveURL(/\/auth\/login/);

      // Heading should be visible
      const heading = page.getByRole('heading', { name: /welcome back/i });
      await expect(heading).toBeVisible();

      // Subtitle should be visible
      await expect(page.getByText(/sign in to your account/i)).toBeVisible();

      // Logo should be visible
      await expect(page.getByText('Autokkeep')).toBeVisible();
    });

    test('login form has email and password fields', async ({ page }) => {
      const emailInput = page.locator('input[type="email"]');
      await expect(emailInput).toBeVisible();
      await expect(emailInput).toHaveAttribute('placeholder', /you@example\.com/i);

      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput).toBeVisible();
    });

    test('shows validation for empty form submission', async ({ page }) => {
      // Click submit without filling any fields
      const submitButton = page.getByRole('button', { name: /sign\s?in/i });
      await submitButton.click();

      // Should remain on login page — HTML5 required validation prevents submission
      await expect(page).toHaveURL(/\/auth\/login/);

      // Email input should still be visible (form was not submitted)
      const emailInput = page.locator('input[type="email"]');
      await expect(emailInput).toBeVisible();
    });

    test('shows inline validation for invalid email format', async ({ page }) => {
      const emailInput = page.locator('input[type="email"]');
      await emailInput.fill('invalid-email');
      await emailInput.blur();

      // Should show email validation error
      const emailError = page.getByText(/valid email/i);
      await expect(emailError).toBeVisible();
    });

    test('shows inline validation for short password', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]');
      await passwordInput.fill('short');
      await passwordInput.blur();

      // Should show password length error
      const passwordError = page.getByText(/at least 8 characters/i);
      await expect(passwordError).toBeVisible();
    });

    test('shows error for invalid credentials', async ({ page }) => {
      // Fill in valid-format but incorrect credentials
      await page.locator('input[type="email"]').fill('nonexistent@example.com');
      await page.locator('input[type="password"]').fill('wrongpassword123');

      // Submit the form
      await page.getByRole('button', { name: /sign\s?in/i }).click();

      // Should show an error toast/message (Supabase returns auth error)
      const errorToast = page.locator('[class*="errorToast"]');
      await expect(errorToast).toBeVisible({ timeout: 10_000 });
    });

    test('password toggle button shows/hides password', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]');
      await passwordInput.fill('testpassword123');

      // Click the show password toggle
      const toggleButton = page.locator('button[aria-label="Show password"]');
      await toggleButton.click();

      // Input type should now be "text"
      await expect(page.locator('input[placeholder="Enter your password"]')).toHaveAttribute('type', 'text');

      // Click again to hide
      const hideButton = page.locator('button[aria-label="Hide password"]');
      await hideButton.click();

      // Input type should be "password" again
      await expect(page.locator('input[placeholder="Enter your password"]')).toHaveAttribute('type', 'password');
    });

    test('forgot password link navigates correctly', async ({ page }) => {
      const forgotLink = page.getByRole('link', { name: /forgot password/i });
      await expect(forgotLink).toBeVisible();
      await forgotLink.click();
      await expect(page).toHaveURL(/\/auth\/forgot-password/);
    });

    test('sign up link navigates to signup page', async ({ page }) => {
      const signupLink = page.getByRole('link', { name: /sign\s?up/i });
      await expect(signupLink).toBeVisible();
      await signupLink.click();
      await expect(page).toHaveURL(/\/auth\/signup/);
    });

    test('back to home link navigates to landing', async ({ page }) => {
      const backLink = page.getByRole('link', { name: /back to home/i });
      await expect(backLink).toBeVisible();
      await backLink.click();
      await expect(page).toHaveURL('/');
    });

    test('URL does not change on failed login attempt', async ({ page }) => {
      await page.locator('input[type="email"]').fill('test@example.com');
      await page.locator('input[type="password"]').fill('wrongpassword123');
      await page.getByRole('button', { name: /sign\s?in/i }).click();

      // Wait for the error toast
      await page.locator('[class*="errorToast"]').waitFor({ state: 'visible', timeout: 10_000 });

      // Should still be on login page
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  });

  test.describe('Signup Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/signup');
    });

    test('signup page loads correctly', async ({ page }) => {
      await expect(page).toHaveURL(/\/auth\/signup/);

      // Heading
      const heading = page.getByRole('heading', { name: /create your account/i });
      await expect(heading).toBeVisible();

      // Subtitle
      await expect(page.getByText(/start understanding your finances/i)).toBeVisible();
    });

    test('signup form has all required fields', async ({ page }) => {
      // Organization name
      const orgInput = page.locator('#signup-org-input');
      await expect(orgInput).toBeVisible();

      // Email
      const emailInput = page.locator('#signup-email-input');
      await expect(emailInput).toBeVisible();

      // Password
      const passwordInput = page.locator('#signup-password-input');
      await expect(passwordInput).toBeVisible();

      // Confirm password
      const confirmPasswordInput = page.locator('#signup-confirm-password-input');
      await expect(confirmPasswordInput).toBeVisible();
    });

    test('submit button is disabled when form is empty', async ({ page }) => {
      const submitButton = page.locator('#signup-submit-button');
      await expect(submitButton).toBeDisabled();
    });

    test('shows password strength indicator when typing', async ({ page }) => {
      const passwordInput = page.locator('#signup-password-input');
      await passwordInput.fill('weakpw');

      // Strength indicator should appear
      const strengthLabel = page.locator('[class*="strengthLabel"]');
      await expect(strengthLabel).toBeVisible();
    });

    test('shows password requirements checklist', async ({ page }) => {
      const passwordInput = page.locator('#signup-password-input');
      await passwordInput.fill('Test');

      // Requirements list should appear
      const requirementsList = page.locator('#signup-password-requirements');
      await expect(requirementsList).toBeVisible();

      // Should show requirement items
      await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
      await expect(page.getByText(/contains uppercase/i)).toBeVisible();
      await expect(page.getByText(/contains lowercase/i)).toBeVisible();
      await expect(page.getByText(/contains a number/i)).toBeVisible();
    });

    test('shows password match/mismatch indicator', async ({ page }) => {
      const passwordInput = page.locator('#signup-password-input');
      const confirmInput = page.locator('#signup-confirm-password-input');

      await passwordInput.fill('TestPassword1');
      await confirmInput.fill('DifferentPassword1');

      // Should show mismatch indicator
      const matchIndicator = page.locator('#signup-password-match-indicator');
      await expect(matchIndicator).toBeVisible();
      await expect(matchIndicator).toContainText(/do not match/i);
    });

    test('shows password match when passwords are the same', async ({ page }) => {
      const passwordInput = page.locator('#signup-password-input');
      const confirmInput = page.locator('#signup-confirm-password-input');

      await passwordInput.fill('TestPassword1');
      await confirmInput.fill('TestPassword1');

      // Should show match indicator
      const matchIndicator = page.locator('#signup-password-match-indicator');
      await expect(matchIndicator).toBeVisible();
      await expect(matchIndicator).toContainText(/passwords match/i);
    });

    test('sign in link navigates to login page', async ({ page }) => {
      const signinLink = page.locator('#signup-signin-link a');
      await expect(signinLink).toBeVisible();
      await signinLink.click();
      await expect(page).toHaveURL(/\/auth\/login/);
    });

    test('back to home link exists on signup page', async ({ page }) => {
      const backLink = page.getByRole('link', { name: /back to home/i });
      await expect(backLink).toBeVisible();
    });

    test('terms and privacy policy links exist', async ({ page }) => {
      const termsLink = page.getByRole('link', { name: /terms of service/i });
      await expect(termsLink).toBeVisible();
      await expect(termsLink).toHaveAttribute('href', '/terms');

      const privacyLink = page.getByRole('link', { name: /privacy policy/i });
      await expect(privacyLink).toBeVisible();
      await expect(privacyLink).toHaveAttribute('href', '/privacy');
    });
  });
});
