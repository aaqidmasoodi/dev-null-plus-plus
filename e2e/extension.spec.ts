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

const settingsHeading = (page: Page) => page.getByRole('heading', { level: 1, name: '/dev/null++' });
const siteContent = (page: Page) => page.locator('main[data-main] > [data-nav-content]');

async function expectSettingsOpen(page: Page): Promise<void> {
  await expect(page).toHaveURL(/#dev-null-plus-plus$/);
  await expect(settingsHeading(page)).toBeVisible();
  await expect(page.getByText('Installed and running')).toBeVisible();
  await expect(siteContent(page)).toBeHidden();
  await expect(navItem(page)).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveTitle('/dev/null++ - /dev/null');
}

async function expectSettingsClosed(page: Page): Promise<void> {
  await expect(settingsHeading(page)).toHaveCount(0);
  await expect(siteContent(page)).toBeVisible();
  await expect(navItem(page)).not.toHaveAttribute('aria-current', 'page');
}

test('opens the settings page from the navigation, on its own URL', async ({ page }) => {
  await page.goto(SITE);
  await navItem(page).click();

  await expectSettingsOpen(page);
  await expect(page).toHaveURL(`${SITE}#dev-null-plus-plus`);
});

test('Back closes the settings page and Forward reopens it', async ({ page }) => {
  await page.goto(SITE);
  await navItem(page).click();
  await expectSettingsOpen(page);

  await page.goBack();
  await expect(page).toHaveURL(SITE);
  await expectSettingsClosed(page);

  await page.goForward();
  await expectSettingsOpen(page);
});

test('reloading the settings URL opens the settings page', async ({ page }) => {
  await page.goto(`${SITE}#dev-null-plus-plus`);

  await expectSettingsOpen(page);
});

test('leaving through the site’s navigation closes the settings page', async ({ page }) => {
  await page.goto(`${SITE}#dev-null-plus-plus`);
  await expectSettingsOpen(page);

  await page.locator('[data-nav-rail] nav[aria-label="Main"] > a').first().click();

  await expect(page).not.toHaveURL(/#dev-null-plus-plus/);
  await expectSettingsClosed(page);
});

test('stays open through the site’s background refresh', async ({ page, errors }) => {
  // The site refreshes the page's data every 30 seconds with Inertia's router.reload(), which requests the current URL.
  test.slow();
  await page.goto(`${SITE}#dev-null-plus-plus`);
  await expectSettingsOpen(page);

  const refresh = page.waitForRequest(
    (request) => request.headers()['x-inertia'] === 'true' && new URL(request.url()).pathname === '/log/latest',
    { timeout: 45_000 },
  );

  await refresh;
  await page.waitForLoadState('networkidle');

  await expectSettingsOpen(page);
  expect(errors.filter((error) => /404|not found/i.test(error))).toEqual([]);
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
