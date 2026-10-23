import type { Page } from '@playwright/test';

import { expect, SITE, test } from './fixtures';

/** The welcome tour, the first time dev-null.sh opens after installing. */

test.use({ welcomed: false });

const welcome = (page: Page) => page.getByRole('dialog');

test('welcomes a new install once, with a step for each feature', async ({ page, errors }) => {
  await page.goto(SITE);
  await expect(welcome(page)).toBeVisible();
  await expect(welcome(page).getByRole('heading')).toHaveText('Welcome to /dev/null++');

  await welcome(page).getByRole('button', { name: 'Show me' }).click();
  await expect(welcome(page).getByRole('heading')).toHaveText('Themes');
  await welcome(page).getByRole('button', { name: 'Back' }).click();
  await expect(welcome(page).getByRole('heading')).toHaveText('Welcome to /dev/null++');

  // The arrow keys page through, and never reach the site's own shortcuts.
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('ArrowRight');
  }

  await expect(welcome(page).getByRole('heading')).toHaveText('You’re all set');
  await welcome(page).getByRole('button', { name: 'Done' }).click();
  await expect(welcome(page)).toHaveCount(0);

  await page.reload();
  await page.locator('[data-dnpp="nav-item"]').waitFor();
  await page.waitForTimeout(1_000);
  await expect(welcome(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('can open the settings page, and be shown again from there', async ({ page }) => {
  await page.goto(SITE);
  await welcome(page).getByRole('button', { name: 'Step 9 of 9' }).click();
  await welcome(page).getByRole('button', { name: 'Open settings' }).click();
  await expect(page).toHaveURL(/#dev-null-plus-plus$/);
  await expect(welcome(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Show the welcome again' }).click();
  await expect(welcome(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(welcome(page)).toHaveCount(0);
});
