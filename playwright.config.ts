import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests load the built extension into Chromium and run it against the live dev-null.sh, signed out. The site
 * deploys many times a day, so these are what tell us an upstream change broke the extension before a user notices.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
});
