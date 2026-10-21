import path from 'node:path';

import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test';

export { expect };

const EXTENSION_PATH = path.resolve(import.meta.dirname, '../.output/chrome-mv3');

export const SITE = 'https://dev-null.sh/log/latest';

/**
 * Turns a feature off or on with its switch on the settings page. Scrolled to and drawn first: Chrome routes a click to
 * a frame by where it was last drawn, so a click straight after the scroll can land in the AI key frame that sat there.
 * Tried again if the site scrolls the page back to the top in between.
 */
export async function switchFeature(page: Page, name: string, value: 'Off' | 'On'): Promise<void> {
  const option = page.getByRole('radiogroup', { name, exact: true }).getByRole('radio', { name: value });

  await expect(async () => {
    await option.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    await option.click();
    await expect(option).toHaveAttribute('aria-checked', 'true', { timeout: 1_000 });
  }).toPass();
}

/**
 * Loads the built extension into a fresh Chromium profile, and collects the page's console errors. The welcome counts
 * as seen, so it doesn't open over every test; its own tests set `welcomed` to false.
 */
export const test = base.extend<{
  welcomed: boolean;
  context: BrowserContext;
  page: Page;
  errors: string[];
  background: Worker;
}>({
  welcomed: [true, { option: true }],
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
  page: async ({ context, background, welcomed, errors }, use) => {
    if (welcomed) {
      await background.evaluate(async () => {
        await (
          globalThis as unknown as { chrome: { storage: { local: { set: (items: unknown) => Promise<void> } } } }
        ).chrome.storage.local.set({ welcomed: true });
      });
    }

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
  /** The extension's service worker. */
  background: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

    await use(worker);
  },
});
