import type { Page } from '@playwright/test';

import { expect, SITE, test } from './fixtures';

/**
 * Peeking at an image by holding it, on the real log. The test adds a two-image grid like the site's own
 * (resources/js/components/commit-images.tsx), with a picture it serves itself, so it does not depend on what has been
 * posted lately.
 */

const PICTURE = 'https://dev-null.sh/__dnpp-test/peek.png';

async function addImages(page: Page): Promise<void> {
  // Any real PNG will do: a screenshot of the page is one, at a known size.
  await page.goto(SITE);
  await page.locator('[data-dnpp="nav-item"]').waitFor();

  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 800, height: 600 } });

  await page.context().route(PICTURE, (route) => route.fulfill({ contentType: 'image/png', body: png }));
  await page.evaluate((src) => {
    const grid = document.createElement('div');

    grid.dataset.test = 'commit-images';
    grid.dataset.imageGrid = '';
    grid.style.cssText =
      'display:grid;grid-template-columns:1fr 1fr;gap:2px;height:240px;overflow:hidden;border-radius:8px;margin:16px';

    for (const id of ['first', 'second']) {
      const link = document.createElement('a');
      const image = document.createElement('img');

      link.href = `#dnpp-photo-${id}`;
      link.style.cssText = 'position:relative;display:block;min-height:0';
      image.id = `dnpp-peek-${id}`;
      image.src = src;
      image.alt = 'A test picture';
      image.style.cssText = 'width:100%;height:100%;object-fit:cover';
      link.append(image);
      grid.append(link);
    }

    document.querySelector('[data-commit]')?.before(grid);
  }, PICTURE);
  await expect
    .poll(() => page.locator('#dnpp-peek-first').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
}

async function press(page: Page): Promise<void> {
  const box = await page.locator('#dnpp-peek-first').boundingBox();

  if (box === null) {
    throw new Error('The test picture is not on screen.');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

test('holding an image peeks at it, and letting go puts it back', async ({ page, errors }) => {
  await addImages(page);

  const peek = page.locator('[data-dnpp="image-peek"]');
  const original = page.locator('#dnpp-peek-first');

  await press(page);
  await expect(peek).toHaveCount(1);
  await expect(peek.locator('img')).toHaveAttribute('src', PICTURE);
  // The page's own picture is hidden underneath while the copy is out.
  await expect.poll(() => original.evaluate((image) => getComputedStyle(image).opacity)).toBe('0');

  // It ends up much bigger than the cell it came from.
  await page.waitForTimeout(600);

  const grown = await peek.locator('img').boundingBox();

  expect(grown?.width).toBeGreaterThan(700);

  await page.mouse.up();
  await expect(peek).toHaveCount(0);
  await expect.poll(() => original.evaluate((image) => getComputedStyle(image).opacity)).toBe('1');
  // The click it ended in did not open the picture.
  expect(new URL(page.url()).hash).toBe('');
  expect(errors).toEqual([]);
});

test('a long hold still only puts the image back when let go', async ({ page }) => {
  await addImages(page);
  await press(page);
  await expect(page.locator('[data-dnpp="image-peek"]')).toHaveCount(1);
  // Longer than any fixed window after the peek starts.
  await page.waitForTimeout(4_000);
  await page.mouse.up();

  await expect(page.locator('[data-dnpp="image-peek"]')).toHaveCount(0);
  await page.waitForTimeout(300);
  // The site's viewer did not open.
  expect(new URL(page.url()).hash).toBe('');
});

test('a quick click still opens the image as usual', async ({ page }) => {
  await addImages(page);
  // A real click: press and release back to back. A timed hold can drift past a click on a slow machine.
  await page.locator('#dnpp-peek-first').click();

  await expect(page.locator('[data-dnpp="image-peek"]')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).hash).toBe('#dnpp-photo-first');
});

test('the page holds still while an image is out', async ({ page }) => {
  await addImages(page);

  const before = await page.evaluate(() => window.scrollY);

  await press(page);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(200);

  expect(await page.evaluate(() => window.scrollY)).toBe(before);

  await page.mouse.up();
  await expect(page.locator('[data-dnpp="image-peek"]')).toHaveCount(0);
});

/**
 * A profile page like the site's (resources/js/pages/user/show.tsx): the profile's own avatar in the page header, and
 * another in a post below. GitHub's avatar host is stood in for by pictures drawn at the size each address asks for.
 */
const PROFILE = 'https://dev-null.sh/@someone?__dnpp-test=avatar';
const AVATAR = 'https://avatars.githubusercontent.com/u/1?v=4';

async function openProfile(page: Page): Promise<void> {
  const context = page.context();

  await context.route(`${AVATAR}*`, (route) => {
    const size = new URL(route.request().url()).searchParams.get('s') ?? '400';

    return route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#d9480f"/></svg>`,
    });
  });
  await context.route(PROFILE, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><div id="app"><main data-main><div data-nav-content>
        <header><img id="profile" data-slot="avatar-image" src="${AVATAR}&s=160" style="width:80px;height:80px"></header>
        <article data-commit="c1"><img id="post" data-slot="avatar-image" src="${AVATAR}&s=80" style="width:40px;height:40px"></article>
      </div></main></div></body></html>`,
    }),
  );
  await page.goto(PROFILE);
  // No React here: the probe soon reports it can't tell, and the extension starts.
  await page.locator('html[data-dnpp-hydration]').waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
}

async function hold(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();

  if (box === null) {
    throw new Error(`${selector} is not on screen.`);
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

test('a profile’s own avatar grows large and sharpens; avatars in posts are left to the site', async ({ page }) => {
  await openProfile(page);

  const peek = page.locator('[data-dnpp="image-peek"]');

  // In a post, hovering an avatar opens the site's card about the person: no peek.
  await hold(page, '#post');
  await page.waitForTimeout(400);
  await expect(peek).toHaveCount(0);
  await page.mouse.up();

  await hold(page, '#profile');
  await expect(peek).toHaveCount(1);
  // Larger than the 160px picture on the page, and then sharp: the same avatar, asked for at that size, fades in.
  await expect
    .poll(() =>
      peek.evaluate((host) =>
        [...(host.shadowRoot?.querySelectorAll('img') ?? [])].map((image) => image.naturalWidth).at(-1),
      ),
    )
    .toBeGreaterThan(400);
  await page.waitForTimeout(400);
  expect((await peek.locator('.copy').boundingBox())?.width).toBeGreaterThan(400);

  await page.mouse.up();
  await expect(peek).toHaveCount(0);
});

test('the first press works even when something else had focus', async ({ page }) => {
  await addImages(page);
  // As after starring or replying: a button has focus, and the press moves it to the image's link.
  await page.evaluate(() => {
    const button = document.createElement('button');

    button.id = 'dnpp-test-focus';
    button.textContent = 'Star';
    document.querySelector('[data-commit]')?.before(button);
    button.focus();
  });
  await press(page);

  await expect(page.locator('[data-dnpp="image-peek"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('[data-dnpp="image-peek"]')).toHaveCount(0);
});
