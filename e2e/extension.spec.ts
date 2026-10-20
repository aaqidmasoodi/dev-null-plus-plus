import path from 'node:path';

import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';

const EXTENSION_PATH = path.resolve(import.meta.dirname, '../.output/chrome-mv3');
const SITE = 'https://dev-null.sh/log/latest';

/** Console output that means React threw away the server-rendered page, which is what the hydration gate prevents. */
const HYDRATION_ERROR = /hydrat|Minified React error #(418|419|421|422|423|425)/i;

const test = base.extend<{ context: BrowserContext; page: Page; errors: string[] }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their dependencies.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });

    await use(context);
    await context.close();
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their dependencies.
  errors: async ({}, use) => {
    await use([]);
  },
  page: async ({ context, errors }, use) => {
    const page = await context.newPage();

    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await use(page);
  },
});

const navItem = (page: Page) => page.locator('[data-test="dnpp-nav-item"]');
const previousLabel = (page: Page) =>
  navItem(page).evaluate((element) => element.previousElementSibling?.textContent.trim());

test('adds dev/null++ to the navigation, directly under Settings', async ({ page, errors }) => {
  await page.goto(SITE);

  await expect(navItem(page)).toBeVisible();
  await expect(navItem(page)).toHaveCount(1);
  await expect(navItem(page)).toHaveText('/dev/null++');
  expect(await previousLabel(page)).toBe('Settings');
  await expect(page.locator('html')).toHaveAttribute('data-dnpp-hydration', 'hydrated');
  expect(errors.filter((error) => HYDRATION_ERROR.test(error))).toEqual([]);
});

test('opens and closes the panel', async ({ page }) => {
  await page.goto(SITE);
  await navItem(page).click();

  // The panel sits in a closed shadow root, which Playwright cannot see into, so check the state the nav item mirrors.
  await expect(navItem(page)).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(navItem(page)).toHaveAttribute('aria-expanded', 'false');
  // Focus returns to the item that opened it.
  await expect(navItem(page)).toBeFocused();
});

test('keeps its place when the navigation collapses and the page changes', async ({ page }) => {
  await page.goto(SITE);
  await expect(navItem(page)).toBeVisible();

  await page.locator('[data-test="nav-collapse-button"]').click();
  await expect(page.locator('[data-nav="collapsed"]')).toBeVisible();
  await expect(navItem(page)).toBeVisible();
  expect(await previousLabel(page)).toBe('Settings');

  // An Inertia visit swaps the page without a reload.
  await page
    .getByRole('link', { name: /trending/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/log\/trending/);
  await expect(navItem(page)).toHaveCount(1);
  expect(await previousLabel(page)).toBe('Settings');
});
