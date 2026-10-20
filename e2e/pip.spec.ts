import type { Page } from '@playwright/test';

import { expect, SITE, test } from './fixtures';

/**
 * Picture-in-picture on the real log. The test adds a video card like the site's own
 * (resources/js/components/link-embed.tsx), with a small script standing in for the site's play button and a video
 * page the test serves itself, so it does not depend on what has been posted or on any provider.
 */

const VIDEO = 'https://dev-null.sh/__dnpp-test/video';

async function addVideo(page: Page): Promise<void> {
  await page
    .context()
    .route(`${VIDEO}*`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#123">video</body>' }),
    );
  await page.goto(SITE);
  await page.locator('[data-dnpp="nav-item"]').waitFor();
  await page.evaluate((src) => {
    const card = document.createElement('div');
    const slot = document.createElement('div');
    const button = document.createElement('button');
    const row = document.createElement('a');

    card.dataset.test = 'link-embed';
    card.dataset.provider = 'Test';
    card.id = 'dnpp-test-video';
    card.style.cssText = 'margin:16px;border:1px solid #444;border-radius:8px;overflow:hidden';
    button.type = 'button';
    button.dataset.test = 'link-embed-play';
    button.setAttribute('aria-label', 'Play A test video from Test');
    button.style.cssText = 'aspect-ratio:16 / 9;display:block;width:100%;background:#333';
    row.href = 'https://example.com/video';
    row.textContent = 'Test · A test video';
    row.style.cssText = 'display:flex;padding:8px 12px';
    slot.append(button);
    card.append(slot, row);
    // Like the site: pressing play swaps the button for the provider's frame.
    button.addEventListener('click', () => {
      const frame = document.createElement('iframe');

      frame.setAttribute('src', src);
      frame.setAttribute('allow', 'autoplay; fullscreen');
      frame.style.cssText = 'display:block;width:100%;aspect-ratio:16 / 9;border:0';
      button.replaceWith(frame);
    });
    document.querySelector('main [data-commit]')?.before(card);
  }, VIDEO);
}

const player = (page: Page) => page.locator('[data-dnpp="pip-player"]');
const isFloating = (page: Page) => player(page).evaluate((host) => host.hasAttribute('data-floating'));
const cardKinds = (page: Page) =>
  page.evaluate(() =>
    [
      ...(document.querySelector('[data-dnpp="pip-cards"]')?.shadowRoot?.querySelectorAll<HTMLElement>('.card') ?? []),
    ].map((card) => card.dataset.kind),
  );

async function play(page: Page): Promise<void> {
  await page.locator('#dnpp-test-video [data-test="link-embed-play"]').click();
  await expect(player(page)).toHaveCount(1);
  // Marks our frame, to tell it is the same one, never reloaded, wherever the player goes.
  await player(page).evaluate((host) => {
    (host.shadowRoot?.querySelector('iframe') as HTMLIFrameElement & { dnppMark?: boolean }).dnppMark = true;
  });
}

const sameFrame = (page: Page) =>
  player(page).evaluate(
    (host) =>
      (host.shadowRoot?.querySelector('iframe') as (HTMLIFrameElement & { dnppMark?: boolean }) | null)?.dnppMark ===
      true,
  );

async function pressInCards(page: Page, selector: string): Promise<void> {
  const box = await page.evaluate((query) => {
    const rect = document
      .querySelector('[data-dnpp="pip-cards"]')
      ?.shadowRoot?.querySelector(query)
      ?.getBoundingClientRect();

    return rect === undefined ? null : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, selector);

  if (box === null) {
    throw new Error(`${selector} is not shown.`);
  }

  await page.mouse.click(box.x, box.y);
}

test('a video plays in our player, over its post, instead of the site’s', async ({ page, errors }) => {
  await addVideo(page);
  await play(page);

  await expect(page.locator('#dnpp-test-video iframe')).toHaveAttribute('src', 'about:blank');
  expect(await isFloating(page)).toBe(false);

  const slot = await page.locator('#dnpp-test-video > div').boundingBox();
  const ours = await player(page).boundingBox();

  expect(Math.abs((ours?.y ?? 0) - (slot?.y ?? 0))).toBeLessThan(2);
  expect(Math.abs((ours?.width ?? 0) - (slot?.width ?? 0))).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('scrolled past, it floats; scrolled back, it comes home, still the same video', async ({ page }) => {
  await addVideo(page);
  await play(page);

  await page.mouse.wheel(0, 1500);
  await expect.poll(() => isFloating(page)).toBe(true);
  await expect.poll(() => cardKinds(page)).toEqual(['elsewhere-pip']);

  await page.locator('#dnpp-test-video').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    window.scrollBy(0, -200);
  });
  await expect.poll(() => isFloating(page)).toBe(false);
  expect(await sameFrame(page)).toBe(true);
});

test('popped out by hand, it is pinned until Play here', async ({ page }) => {
  await addVideo(page);
  await play(page);

  await pressInCards(page, '.pip');
  await expect.poll(() => isFloating(page)).toBe(true);

  // Its post is in full view, and still it stays out.
  await page.waitForTimeout(800);
  expect(await isFloating(page)).toBe(true);

  await pressInCards(page, '.play-here');
  await expect.poll(() => isFloating(page)).toBe(false);
  expect(await sameFrame(page)).toBe(true);
});

test('it keeps playing on other pages, and closing it there stops it', async ({ page }) => {
  await addVideo(page);
  await play(page);

  // Visiting another page within the site: the post is gone, the video floats on.
  await page.locator('main a[href^="/@"]').first().click();
  await page.waitForURL(/\/@/);
  await expect.poll(() => isFloating(page)).toBe(true);
  expect(await sameFrame(page)).toBe(true);

  await player(page).hover();
  await player(page).evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>('button[aria-label="Close video"]')?.click();
  });
  await expect(player(page)).toHaveCount(0);
});

test('can be switched off on the settings page', async ({ page }) => {
  await page.goto(`${SITE}#dev-null-plus-plus`);
  await page
    .getByRole('radiogroup', { name: 'Picture-in-picture', exact: true })
    .getByRole('radio', { name: 'Off' })
    .click();
  await addVideo(page);
  await page.locator('#dnpp-test-video [data-test="link-embed-play"]').click();

  // The site plays it as it always did.
  await expect(page.locator('#dnpp-test-video iframe')).toHaveAttribute('src', VIDEO);
  await expect(player(page)).toHaveCount(0);
});
