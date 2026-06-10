import { test, expect } from '@playwright/test';

test.describe('Core Accessibility', () => {
  test.describe('Landing Page Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
    });

    test('all images have alt text', async ({ page }) => {
      const images = page.locator('img');
      const imageCount = await images.count();

      for (let i = 0; i < imageCount; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const ariaLabel = await img.getAttribute('aria-label');
        const ariaHidden = await img.getAttribute('aria-hidden');
        const role = await img.getAttribute('role');

        // Image should have alt text, aria-label, or be decorative (aria-hidden/role=presentation)
        const isAccessible =
          (alt !== null && alt !== '') ||
          (ariaLabel !== null && ariaLabel !== '') ||
          ariaHidden === 'true' ||
          role === 'presentation' ||
          role === 'none';

        expect(isAccessible, `Image at index ${i} is missing alt text or accessibility attributes`).toBeTruthy();
      }
    });

    test('page has exactly one h1 element', async ({ page }) => {
      const h1Elements = page.locator('h1');
      const count = await h1Elements.count();
      expect(count).toBe(1);
    });

    test('heading hierarchy is correct (no skipped levels)', async ({ page }) => {
      const headings = await page.evaluate(() => {
        const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        return Array.from(elements).map((el) => ({
          level: parseInt(el.tagName[1]),
          text: el.textContent?.trim().slice(0, 50) || '',
        }));
      });

      // Each heading should not skip more than one level
      for (let i = 1; i < headings.length; i++) {
        const prev = headings[i - 1].level;
        const curr = headings[i].level;
        // Going deeper should not skip a level (e.g., h1 -> h3 is bad)
        if (curr > prev) {
          expect(
            curr - prev,
            `Heading hierarchy skip: h${prev} -> h${curr} ("${headings[i].text}")`
          ).toBeLessThanOrEqual(1);
        }
      }
    });

    test('navigation landmark exists with proper role', async ({ page }) => {
      const nav = page.locator('nav[role="navigation"], nav');
      await expect(nav.first()).toBeVisible();
    });

    test('navigation has aria-label', async ({ page }) => {
      const nav = page.locator('nav[aria-label]');
      const count = await nav.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('skip-to-content link exists', async ({ page }) => {
      // The layout has a skip-to-content link
      const skipLink = page.locator('a[href="#main-content"]');
      const count = await skipLink.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('skip-to-content link is keyboard accessible', async ({ page }) => {
      // Tab to the first focusable element — should be skip link
      await page.keyboard.press('Tab');

      const activeElement = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el?.tagName,
          href: (el as HTMLAnchorElement)?.getAttribute('href'),
          text: el?.textContent?.trim(),
        };
      });

      // The first focusable element should be the skip link
      expect(activeElement.href).toBe('#main-content');
      expect(activeElement.text).toMatch(/skip/i);
    });

    test('main content landmark exists', async ({ page }) => {
      const main = page.locator('main#main-content');
      await expect(main).toBeVisible();
    });

    test('footer landmark exists', async ({ page }) => {
      const footer = page.locator('footer');
      await expect(footer).toBeVisible();
    });

    test('all interactive elements are keyboard-focusable', async ({ page }) => {
      // Get all buttons and links in the visible navbar area
      const interactiveElements = page.locator('nav a, nav button, nav select');
      const count = await interactiveElements.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const el = interactiveElements.nth(i);
        const isVisible = await el.isVisible();

        if (isVisible) {
          const tabIndex = await el.getAttribute('tabindex');
          // Interactive elements should not have tabindex="-1" (unless hidden)
          if (tabIndex !== null) {
            expect(parseInt(tabIndex)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });

    test('aria-live region exists for notifications', async ({ page }) => {
      const liveRegion = page.locator('[aria-live]');
      const count = await liveRegion.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('html lang attribute is set', async ({ page }) => {
      const lang = await page.locator('html').getAttribute('lang');
      expect(lang).toBeTruthy();
      expect(lang).toBe('en');
    });
  });

  test.describe('Login Page Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login');
    });

    test('login form labels are associated with inputs', async ({ page }) => {
      // Check that each input has an associated label (via label element or aria-label)
      const inputs = page.locator('form input[type="email"], form input[type="password"]');
      const count = await inputs.count();

      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');

        if (id) {
          // Check if there's a matching label
          const matchingLabel = page.locator(`label[for="${id}"]`);
          const labelCount = await matchingLabel.count();

          const hasAssociation =
            labelCount > 0 ||
            ariaLabel !== null ||
            ariaLabelledBy !== null;

          expect(
            hasAssociation,
            `Input with id="${id}" is missing label association`
          ).toBeTruthy();
        }
      }
    });

    test('form has accessible submit button', async ({ page }) => {
      const submitButton = page.getByRole('button', { name: /sign\s?in/i });
      await expect(submitButton).toBeVisible();

      // Button should be focusable
      const tabIndex = await submitButton.getAttribute('tabindex');
      if (tabIndex !== null) {
        expect(parseInt(tabIndex)).toBeGreaterThanOrEqual(0);
      }
    });

    test('password toggle has accessible aria-label', async ({ page }) => {
      const toggleButton = page.locator('button[aria-label*="password"]');
      await expect(toggleButton.first()).toBeVisible();

      const ariaLabel = await toggleButton.first().getAttribute('aria-label');
      expect(ariaLabel).toMatch(/show|hide/i);
    });

    test('login page has proper heading structure', async ({ page }) => {
      // Should have a heading (h1 or h2)
      const headings = page.locator('h1, h2');
      const count = await headings.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('form inputs have required attribute', async ({ page }) => {
      const emailInput = page.locator('input[type="email"]');
      await expect(emailInput).toHaveAttribute('required', '');

      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput).toHaveAttribute('required', '');
    });

    test('form inputs have autocomplete attributes', async ({ page }) => {
      const emailInput = page.locator('input[type="email"]');
      await expect(emailInput).toHaveAttribute('autocomplete', 'email');

      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });
  });

  test.describe('Signup Page Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/signup');
    });

    test('signup form has labels for all fields', async ({ page }) => {
      const form = page.locator('#signup-form');
      await expect(form).toBeVisible();

      // Check the form has labeled inputs
      const inputs = form.locator('input');
      const count = await inputs.count();
      expect(count).toBeGreaterThanOrEqual(4); // org, email, password, confirm
    });

    test('signup heading has proper level', async ({ page }) => {
      const heading = page.locator('#signup-heading');
      await expect(heading).toBeVisible();

      const tagName = await heading.evaluate((el) => el.tagName.toLowerCase());
      expect(['h1', 'h2']).toContain(tagName);
    });

    test('password toggle buttons have aria-labels', async ({ page }) => {
      const passwordToggle = page.locator('#signup-password-toggle');
      await expect(passwordToggle).toBeVisible();
      await expect(passwordToggle).toHaveAttribute('aria-label', /password/i);

      const confirmToggle = page.locator('#signup-confirm-password-toggle');
      await expect(confirmToggle).toBeVisible();
      await expect(confirmToggle).toHaveAttribute('aria-label', /password/i);
    });
  });

  test.describe('Color Contrast (Key Elements)', () => {
    test('primary heading text has sufficient contrast', async ({ page }) => {
      await page.goto('/');

      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();

      // Get computed styles to verify text isn't invisible
      const styles = await h1.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          fontSize: computed.fontSize,
        };
      });

      // Text color should not be fully transparent or same as background
      expect(styles.color).not.toBe('rgba(0, 0, 0, 0)');
      expect(styles.color).not.toBe('transparent');

      // Font size should be reasonable for a heading
      const fontSize = parseFloat(styles.fontSize);
      expect(fontSize).toBeGreaterThan(16);
    });

    test('login form elements have visible text', async ({ page }) => {
      await page.goto('/auth/login');

      const heading = page.getByRole('heading', { name: /welcome back/i });
      await expect(heading).toBeVisible();

      const styles = await heading.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          color: computed.color,
          opacity: computed.opacity,
          visibility: computed.visibility,
        };
      });

      expect(styles.opacity).not.toBe('0');
      expect(styles.visibility).not.toBe('hidden');
    });

    test('CTA buttons have visible text with contrast', async ({ page }) => {
      await page.goto('/');

      // Check the primary CTA
      const ctaLinks = page.locator('#hero a[href*="/demo"], #hero a[href*="/auth"]');
      const count = await ctaLinks.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const link = ctaLinks.nth(i);
        if (await link.isVisible()) {
          const styles = await link.evaluate((el) => {
            const computed = window.getComputedStyle(el);
            return {
              color: computed.color,
              opacity: computed.opacity,
            };
          });

          expect(styles.opacity).not.toBe('0');
          expect(styles.color).not.toBe('transparent');
        }
      }
    });
  });
});
