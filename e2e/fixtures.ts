import path from 'node:path';

import { chromium, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test';

export { expect } from '@playwright/test';

const EXTENSION_PATH = path.resolve(import.meta.dirname, '../.output/chrome-mv3');

export const SITE = 'https://dev-null.sh/log/latest';

/** Loads the built extension into a fresh Chromium profile, and collects the page's console errors. */
export const test = base.extend<{ context: BrowserContext; page: Page; errors: string[]; background: Worker }>({
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
  /** The extension's service worker. */
  background: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

    await use(worker);
  },
});
