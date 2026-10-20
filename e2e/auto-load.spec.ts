import type { BrowserContext, Page } from '@playwright/test';

import { logHtml } from '../tests/fixtures/site';

import { expect, SITE, test } from './fixtures';

/**
 * Loading new commits on their own. The deterministic tests use a log page that mirrors the real markup, served at a
 * dev-null.sh URL, with a small script standing in for the site's pill handler. The last test watches the real log for
 * a real pill, which also tells us if the site changed how the pill looks.
 */

const FIXTURE = 'https://dev-null.sh/log/latest?__dnpp-test=auto-load';

/** Like the site: clicking the pill puts the new commits on top, drops the pill, and reports the visit finished. */
const SITE_SCRIPT = `
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');

    if (!button || !/new commits?/.test(button.textContent)) return;

    setTimeout(() => {
      const feed = document.querySelector('.feed');

      for (const id of ['new-2', 'new-1']) {
        const row = document.createElement('article');
        row.dataset.commit = id;
        row.textContent = 'Commit ' + id;
        row.style.height = '120px';
        feed.prepend(row);
      }

      button.parentElement.remove();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.dispatchEvent(new CustomEvent('inertia:navigate'));
      document.dispatchEvent(new CustomEvent('inertia:finish'));
    }, 150);
  });

  window.showPill = (count) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'pill-wrapper';
    wrapper.style.cssText = 'position: sticky; top: 0; height: 0; display: flex; justify-content: center;';
    wrapper.innerHTML = '<button type="button"><svg></svg>' + count + ' new commits</button>';
    document.querySelector('[data-nav-content] .sticky').after(wrapper);
  };
`;

async function serveLog(context: BrowserContext): Promise<void> {
  const ids = Array.from({ length: 40 }, (_, index) => `old-${String(index)}`);

  await context.route(FIXTURE, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><style>article { height: 120px; }</style></head><body>${logHtml({ ids })}<script>${SITE_SCRIPT}</script></body></html>`,
    }),
  );
}

const ours = (page: Page) => page.locator('[data-test="dnpp-auto-load"]');

test('loads new commits as if clicked when the reader is at the top', async ({ page, context }) => {
  await serveLog(context);
  await page.goto(FIXTURE);
  await page.evaluate(() => {
    (window as unknown as { showPill: (count: number) => void }).showPill(2);
  });

  await expect(ours(page)).toContainText('Fetching 2 new commits');
  await expect(page.locator('[data-commit="new-1"]')).toBeVisible();
  await expect(ours(page)).toContainText('2 new commits loaded');
  await expect(ours(page)).toHaveCount(0, { timeout: 5_000 });
});

test('keeps new commits tinted until the reader has had a chance to see them', async ({ page, context }) => {
  await serveLog(context);
  await page.goto(FIXTURE);
  await page.mouse.move(10, 10);
  await page.evaluate(() => {
    (window as unknown as { showPill: (count: number) => void }).showPill(2);
  });

  const tint = (id: string) =>
    page.locator(`[data-commit="${id}"]`).evaluate((row) => getComputedStyle(row).backgroundColor);
  const clear = 'rgba(0, 0, 0, 0)';

  await expect(page.locator('[data-commit="new-1"]')).toBeVisible();
  // New commits are tinted; the ones that were already there are not.
  await expect.poll(() => tint('new-1')).not.toBe(clear);
  expect(await tint('old-0')).toBe(clear);

  // Sitting still, the tint stays.
  await page.waitForTimeout(3_000);
  expect(await tint('new-1')).not.toBe(clear);

  // Once the reader moves, it fades a few seconds later.
  await page.mouse.move(200, 200, { steps: 5 });
  await expect.poll(() => tint('new-1'), { timeout: 7_000 }).toBe(clear);
});

test('never moves a reader who is scrolled down, then loads once they are back at the top', async ({
  page,
  context,
}) => {
  await serveLog(context);
  await page.goto(FIXTURE);
  await page.evaluate(() => {
    window.scrollTo(0, 2000);
  });
  await page.evaluate(() => {
    (window as unknown as { showPill: (count: number) => void }).showPill(3);
  });

  await expect(ours(page)).toContainText('3 new commits above');
  // Nothing loaded and nothing moved.
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => window.scrollY)).toBe(2000);
  await expect(page.locator('[data-commit="new-1"]')).toHaveCount(0);

  // Clicking ours takes them up, and the commits load on arrival.
  await ours(page).click();
  await expect(page.locator('[data-commit="new-1"]')).toBeVisible();
  await expect(ours(page)).toHaveCount(0, { timeout: 5_000 });
});

test('can be switched off on the settings page', async ({ page, context }) => {
  await serveLog(context);
  await page.goto(`${SITE}#dev-null-plus-plus`);
  await page
    .getByRole('radiogroup', { name: 'Load new commits automatically' })
    .getByRole('radio', { name: 'Off' })
    .click();

  await page.goto(FIXTURE);
  await page.evaluate(() => {
    (window as unknown as { showPill: (count: number) => void }).showPill(2);
  });
  await page.waitForTimeout(1_000);

  await expect(ours(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '2 new commits' })).toBeVisible();
});

test('picks up the real pill on the live log', async ({ page }) => {
  // The pill only shows when somebody commits, which on a quiet day may not happen within the test's patience.
  test.slow();
  await page.goto(SITE);

  const seen = await page.evaluate(async () => {
    const started = Date.now();

    while (Date.now() - started < 100_000) {
      if (document.querySelector('[data-test="dnpp-auto-load"]') !== null) {
        return 'ours';
      }

      const pill = [...document.querySelectorAll('main button')].find((button) =>
        /^\s*\d+\s+new commits?\s*$/.test(button.textContent),
      );

      // The site's pill showing, uncovered, for more than a moment means we did not recognise it.
      if (pill !== undefined && pill.parentElement?.hasAttribute('data-dnpp-covered') !== true) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));

        if (document.querySelector('[data-test="dnpp-auto-load"]') === null && pill.isConnected) {
          return 'missed';
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return 'quiet';
  });

  test.skip(seen === 'quiet', 'Nobody committed while we watched.');
  expect(seen).toBe('ours');
});
