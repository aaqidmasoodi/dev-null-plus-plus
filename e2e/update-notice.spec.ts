import type { Worker } from '@playwright/test';

import { expect, SITE, test } from './fixtures';

/** The new-version notice. GitHub's answer is stood in for by what the background would have stored. */

async function store(background: Worker, items: Record<string, unknown>): Promise<void> {
  await background.evaluate(
    (values) =>
      (
        globalThis as unknown as { chrome: { storage: { local: { set: (items: unknown) => Promise<void> } } } }
      ).chrome.storage.local.set(values),
    items,
  );
}

test('says when a newer version is out, links to it, and stays closed once closed', async ({ page, background }) => {
  await store(background, { update: { checkedAt: Date.now(), latest: '99.0.0' } });
  await page.goto(SITE);

  const notice = page.getByRole('region', { name: 'New version' });

  await expect(notice).toContainText('/dev/null++ v99.0.0 is out.');
  await expect(notice.getByRole('link', { name: 'Get v99.0.0' })).toHaveAttribute(
    'href',
    'https://github.com/aaqidmasoodi/dev-null-plus-plus/releases/tag/v99.0.0',
  );

  await notice.getByRole('button', { name: 'Hide until the next version' }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(page.locator('[data-dnpp="nav-item"]')).toBeVisible();
  await expect(notice).toBeHidden();

  // The next version shows again.
  await store(background, { update: { checkedAt: Date.now(), latest: '99.1.0' } });
  await expect(notice).toContainText('v99.1.0');
});

test('says nothing when it is off, or already up to date', async ({ page, background }) => {
  await store(background, { update: { checkedAt: Date.now(), latest: '0.0.1' } });
  await page.goto(SITE);
  await expect(page.locator('[data-dnpp="nav-item"]')).toBeVisible();
  await expect(page.locator('[data-dnpp="update-notice"]')).toHaveCount(0);

  await store(background, {
    update: { checkedAt: Date.now(), latest: '99.0.0' },
    settings: { features: { updateNotice: false } },
  });
  await page.reload();
  await expect(page.locator('[data-dnpp="nav-item"]')).toBeVisible();
  await expect(page.locator('[data-dnpp="update-notice"]')).toHaveCount(0);
});

test('the background can ask GitHub, and only GitHub’s API', async ({ background }) => {
  const reached = await background.evaluate(() =>
    fetch('https://api.github.com/repos/aaqidmasoodi/dev-null-plus-plus/releases/latest').then(
      () => true,
      () => false,
    ),
  );
  const elsewhere = await background.evaluate(() =>
    fetch('https://github.com/').then(
      () => true,
      () => false,
    ),
  );

  expect(reached).toBe(true);
  expect(elsewhere).toBe(false);
});
