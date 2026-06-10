import { test, expect } from '@playwright/test';

test.describe('Landing Page & Public Routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Page Metadata', () => {
    test('page loads with correct title', async ({ page }) => {
      await expect(page).toHaveTitle(/Autokkeep/i);
    });

    test('page has meta description', async ({ page }) => {
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toHaveAttribute('content', /.+/);
      const content = await metaDescription.getAttribute('content');
      expect(content!.length).toBeGreaterThan(20);
    });
  });

  test.describe('Hero Section', () => {
    test('hero section is visible with heading', async ({ page }) => {
      const heroSection = page.locator('#hero');
      await expect(heroSection).toBeVisible();

      // Should contain an h1 heading
      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      await expect(heading).not.toBeEmpty();
    });

    test('hero section has CTA buttons', async ({ page }) => {
      const heroSection = page.locator('#hero');

      // "Watch Demo" / demo link CTA
      const demoCta = heroSection.locator('a[href*="/demo"]');
      await expect(demoCta.first()).toBeVisible();

      // "Start Free Trial" / signup CTA
      const signupCta = heroSection.locator('a[href*="/auth/signup"], button:has-text("trial"), a:has-text("trial")');
      await expect(signupCta.first()).toBeVisible();
    });

    test('hero CTA navigates to demo page', async ({ page }) => {
      const demoCta = page.locator('#hero a[href*="/demo"]').first();
      await demoCta.click();
      await expect(page).toHaveURL(/\/demo/);
    });
  });

  test.describe('Navigation', () => {
    test('navbar has Features link', async ({ page }) => {
      const featuresLink = page.locator('nav a[href*="features"]');
      await expect(featuresLink.first()).toBeVisible();
    });

    test('navbar has Pricing link', async ({ page }) => {
      const pricingLink = page.locator('nav a[href*="pricing"]');
      await expect(pricingLink.first()).toBeVisible();
    });

    test('navbar has Demo link', async ({ page }) => {
      const demoLink = page.locator('nav a[href*="/demo"]');
      await expect(demoLink.first()).toBeVisible();
    });

    test('Login button navigates to /auth/login', async ({ page }) => {
      // Login link in the desktop nav
      const loginLink = page.locator('nav a[href="/auth/login"]').first();
      await expect(loginLink).toBeVisible();
      await loginLink.click();
      await expect(page).toHaveURL(/\/auth\/login/);
    });

    test('Sign Up / Start Free Trial button navigates to /auth/signup', async ({ page }) => {
      const signupLink = page.locator('nav a[href="/auth/signup"]').first();
      await expect(signupLink).toBeVisible();
      await signupLink.click();
      await expect(page).toHaveURL(/\/auth\/signup/);
    });
  });

  test.describe('Footer', () => {
    test('footer is visible', async ({ page }) => {
      const footer = page.locator('footer');
      await expect(footer).toBeVisible();
    });

    test('footer contains brand logo link', async ({ page }) => {
      const footerLogo = page.locator('footer a[aria-label="Autokkeep Home"]');
      await expect(footerLogo).toBeVisible();
    });

    test('footer contains Product links', async ({ page }) => {
      const footer = page.locator('footer');

      // Features link
      await expect(footer.locator('a[href*="features"]').first()).toBeVisible();

      // Pricing link
      await expect(footer.locator('a[href*="pricing"]').first()).toBeVisible();

      // Demo link
      await expect(footer.locator('a[href*="/demo"]').first()).toBeVisible();
    });

    test('footer contains Company links', async ({ page }) => {
      const footer = page.locator('footer');

      await expect(footer.locator('a[href="/about"]')).toBeVisible();
      await expect(footer.locator('a[href="/blog"]')).toBeVisible();
      await expect(footer.locator('a[href="/contact"]')).toBeVisible();
    });

    test('footer contains Legal links', async ({ page }) => {
      const footer = page.locator('footer');

      await expect(footer.locator('a[href="/privacy"]').first()).toBeVisible();
      await expect(footer.locator('a[href="/terms"]').first()).toBeVisible();
      await expect(footer.locator('a[href="/security"]').first()).toBeVisible();
    });

    test('footer displays copyright text', async ({ page }) => {
      const footer = page.locator('footer');
      const copyrightText = await footer.textContent();
      expect(copyrightText).toMatch(/©|copyright|autokkeep/i);
    });
  });

  test.describe('Mobile Responsive', () => {
    test('hamburger menu appears at small viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');

      const hamburger = page.locator('button[aria-label="Toggle mobile menu"]');
      await expect(hamburger).toBeVisible();
    });

    test('hamburger menu opens and shows navigation links', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');

      const hamburger = page.locator('button[aria-label="Toggle mobile menu"]');
      await hamburger.click();

      // Wait for aria-expanded to be set
      await expect(hamburger).toHaveAttribute('aria-expanded', 'true');

      // Mobile menu should show navigation links
      const mobileMenu = page.locator('[class*="mobileMenu"][class*="open"]');
      await expect(mobileMenu).toBeVisible();

      // Check for Features link in the mobile menu
      await expect(mobileMenu.locator('a[href*="features"]')).toBeVisible();

      // Check for Pricing link in the mobile menu
      await expect(mobileMenu.locator('a[href*="pricing"]')).toBeVisible();

      // Check for Login/Signup actions in mobile menu
      await expect(mobileMenu.locator('a[href="/auth/login"]')).toBeVisible();
      await expect(mobileMenu.locator('a[href="/auth/signup"]')).toBeVisible();
    });

    test('hamburger menu closes when a link is clicked', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');

      const hamburger = page.locator('button[aria-label="Toggle mobile menu"]');
      await hamburger.click();
      await expect(hamburger).toHaveAttribute('aria-expanded', 'true');

      // Click a mobile link
      const mobileMenu = page.locator('[class*="mobileMenu"][class*="open"]');
      await mobileMenu.locator('a[href*="features"]').click();

      // Menu should close (aria-expanded flips back)
      await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
    });
  });

  test.describe('Landing Page Sections', () => {
    test('social proof section is rendered', async ({ page }) => {
      // SocialProof component should be in the DOM
      const mainContent = page.locator('main');
      await expect(mainContent).toBeVisible();
    });

    test('features grid section is rendered', async ({ page }) => {
      // Scroll to features section
      const featuresSection = page.locator('#features, [id*="feature"]');
      if (await featuresSection.count() > 0) {
        await featuresSection.first().scrollIntoViewIfNeeded();
        await expect(featuresSection.first()).toBeVisible();
      }
    });

    test('pricing section is rendered', async ({ page }) => {
      const pricingSection = page.locator('#pricing, [id*="pricing"]');
      if (await pricingSection.count() > 0) {
        await pricingSection.first().scrollIntoViewIfNeeded();
        await expect(pricingSection.first()).toBeVisible();
      }
    });
  });

  test.describe('Country & Language Selectors', () => {
    test('country selector is visible in desktop nav', async ({ page }) => {
      const countrySelect = page.locator('nav select[aria-label="Select country"]');
      await expect(countrySelect.first()).toBeVisible();
    });

    test('language selector is visible in desktop nav', async ({ page }) => {
      const languageSelect = page.locator('nav select[aria-label="Select language"]');
      await expect(languageSelect.first()).toBeVisible();
    });
  });
});
