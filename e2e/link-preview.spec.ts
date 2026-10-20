import type { Page } from '@playwright/test';

import { expect, SITE, test } from './fixtures';

/**
 * Previewing a link by holding it, on the real log. The previewed page is served by the test at example.com, so we can
 * see exactly what the browser sent it.
 */

const TARGET = 'https://example.com/dnpp-preview';

async function addLink(page: Page, href = TARGET): Promise<void> {
  await page.goto(SITE);
  await page.locator('[data-dnpp="nav-item"]').waitFor();
  await page.evaluate((href) => {
    const link = document.createElement('a');

    link.id = 'dnpp-test-link';
    link.href = href;
    link.target = '_blank';
    link.textContent = 'a link to preview';
    link.style.cssText = 'display:block;padding:16px';
    document.querySelector('[data-commit]')?.before(link);
  }, href);
}

async function hold(page: Page, ms: number): Promise<void> {
  const box = await page.locator('#dnpp-test-link').boundingBox();

  if (box === null) {
    throw new Error('The test link is not on screen.');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('holding a link previews it privately, without opening it', async ({ context, page, errors }) => {
  // The user is signed in to the previewed site: the preview must not be.
  await context.addCookies([
    { name: 'session', value: 'secret', domain: 'example.com', path: '/', secure: true, sameSite: 'None' },
  ]);
  await context.route(`${TARGET}*`, async (route) => {
    expect(await route.request().headerValue('referer')).toBeNull();
    await route.fulfill({
      contentType: 'text/html',
      body: '<h1 id="previewed">Previewed</h1><script>document.title = "cookie:" + document.cookie;</script>',
    });
  });
  await addLink(page);

  const tabs = context.pages().length;
  const dialog = page.locator('[data-test="dnpp-link-preview"]');
  const framed = page.frameLocator('[data-test="dnpp-link-preview"] iframe');

  await hold(page, 700);

  await expect(dialog).toBeVisible();
  await expect(framed.locator('#previewed')).toHaveText('Previewed');
  // Checked inside the page: Playwright reports intercepted requests with its own cookie jar, not what was sent.
  expect(await framed.locator('html').evaluate(() => document.title)).toBe('cookie:');
  expect(context.pages().length).toBe(tabs);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-test="dnpp-link-preview"] iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a quick click still opens the link as usual', async ({ context, page }) => {
  await context.route(`${TARGET}*`, (route) => route.fulfill({ contentType: 'text/html', body: 'ok' }));
  await addLink(page);

  const opened = context.waitForEvent('page');

  await hold(page, 80);

  expect((await opened).url()).toBe(TARGET);
  await expect(page.locator('[data-test="dnpp-link-preview"]')).toBeHidden();
});

test('letting go before it is full size shrinks it back, and opens nothing', async ({ context, page }) => {
  await context.route(`${TARGET}*`, (route) => route.fulfill({ contentType: 'text/html', body: 'ok' }));
  await addLink(page);

  const tabs = context.pages().length;
  const dialog = page.locator('[data-test="dnpp-link-preview"]');

  await hold(page, 350);

  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-test="dnpp-link-preview"] iframe')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(context.pages().length).toBe(tabs);
});

test('sites that refuse to be framed are left as plain links', async ({ context, page }) => {
  const github = 'https://github.com/nunomaduro/dev-null.sh';

  await context.route(`${github}*`, (route) => route.fulfill({ contentType: 'text/html', body: 'ok' }));
  await addLink(page, github);

  const opened = context.waitForEvent('page');

  await hold(page, 900);

  expect((await opened).url()).toBe(github);
  await expect(page.locator('[data-test="dnpp-link-preview"]')).toBeHidden();
});
