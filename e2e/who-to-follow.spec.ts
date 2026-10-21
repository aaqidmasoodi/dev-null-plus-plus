import type { Page } from '@playwright/test';

import { FIXTURE_PEOPLE, suggestedRowHtml, whoToFollowHtml, type FixturePerson } from '../tests/fixtures/site';

import { expect, SITE, test } from './fixtures';

/**
 * "Who to follow" as cards, on the real site. Only signed-in readers get the block, so the test puts the site's own
 * markup for it (resources/js/components/who-to-follow.tsx) into the real aside, with made-up people, and a small
 * script standing in for the site's follow and "Not interested" handlers. The avatars are pictures it draws itself.
 */

const COLOURS = ['#d9480f', '#2f9e44', '#9c36b5', '#0c8599', '#c2255c'];

/** Puts the block in the aside. With `nextPage`, "Suggest other people" brings those people, once. */
async function addWhoToFollow(page: Page, nextPage: FixturePerson[] = []): Promise<void> {
  await page.context().route('https://avatars.githubusercontent.com/u/**', (route) => {
    const url = new URL(route.request().url());
    const name = url.searchParams.get('u') ?? '?';
    const colour = COLOURS[name.length % COLOURS.length] ?? '#888';

    return route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="#1b1b1f"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><text x="200" y="250" font-family="sans-serif" font-size="150" font-weight="600" fill="white" text-anchor="middle">${name.slice(0, 2).toUpperCase()}</text></svg>`,
    });
  });
  await page.goto(SITE);
  await page.locator('[data-dnpp="nav-item"]').waitFor();
  await page.evaluate(
    ({ block, spare, next }) => {
      const seen = { follows: [] as string[], dismissals: [] as string[] };
      const spares = [spare];
      const pages = next === '' ? [] : [next];
      const counts = { refreshes: 0 };
      // Where the site puts it: after the aside's first block, before its footer links.
      const first = [...document.querySelectorAll('aside > section')].find((element) => element.clientWidth > 0);

      Object.assign(window, { seen, counts });
      first?.insertAdjacentHTML('afterend', block);
      // Like the site: following flips the button once the server answers; "Not interested" brings in a spare.
      document.addEventListener('click', (event) => {
        // "Suggest other people": the next page of people in place of the list, if there is one.
        if ((event.target as Element).closest('[data-test="who-to-follow-refresh"]') !== null) {
          counts.refreshes++;

          const list = document.querySelector('section[aria-labelledby="aside-who-to-follow"] ul');
          const page = pages.shift();

          if (list !== null && page !== undefined) {
            list.innerHTML = page;
          }

          return;
        }

        const button = (event.target as Element).closest<HTMLElement>('[data-test^="suggested-"]');
        const username = /@([\w-]+)/.exec(button?.getAttribute('aria-label') ?? '')?.[1] ?? '';

        if (button?.dataset.test === 'suggested-follow-button') {
          seen.follows.push(username);
          setTimeout(() => {
            button.setAttribute('aria-label', `Unfollow @${username}`);
          }, 100);
        } else if (button?.dataset.test === 'suggested-dismiss-button') {
          seen.dismissals.push(username);
          // One spare, like a site with one more person to suggest.
          button.closest('li')?.insertAdjacentHTML('afterend', spares.shift() ?? '');
          button.closest('li')?.remove();
        }
      });
    },
    {
      block: whoToFollowHtml(),
      spare: suggestedRowHtml(FIXTURE_PEOPLE[3] ?? { username: 'x', name: 'X' }),
      next: nextPage.map(suggestedRowHtml).join(''),
    },
  );
}

const deck = (page: Page) => page.locator('[data-dnpp="who-to-follow"]');
const top = (page: Page) => deck(page).locator('.card[data-depth="0"]');
const seen = (page: Page) =>
  page.evaluate(() => (window as unknown as { seen: { follows: string[]; dismissals: string[] } }).seen);

async function swipe(page: Page, by: number): Promise<void> {
  const box = await top(page).locator('.picture').boundingBox();

  if (box === null) {
    throw new Error('The card is not on screen.');
  }

  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();

  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(box.x + box.width / 2 + (by * step) / 10, y);
  }

  await page.mouse.up();
}

const stack = (page: Page) =>
  deck(page)
    .locator('.card')
    .evaluateAll((cards) =>
      cards
        .sort((a, b) => Number(a.getAttribute('data-depth')) - Number(b.getAttribute('data-depth')))
        .map((card) => card.getAttribute('aria-label')?.split(',')[0]),
    );

test('swiping a card away is "Not interested", and whoever the site brings in joins at the back', async ({
  page,
  errors,
}) => {
  await addWhoToFollow(page);

  await expect.poll(() => stack(page)).toEqual(['Ada Park', 'Tomás Reyes', 'Minji Kim']);
  // Just the cards: the site's rows are hidden, still there for the cards to act through, and there are no arrows.
  await expect(page.locator('section[aria-labelledby="aside-who-to-follow"] ul')).toBeHidden();
  await expect(top(page).getByRole('button')).toHaveCount(2);
  await expect(deck(page).getByRole('button', { name: /person/ })).toHaveCount(0);

  await swipe(page, -200);
  await expect.poll(() => stack(page)).toEqual(['Tomás Reyes', 'Minji Kim', 'Olu Adeyemi']);

  // A short drag settles back, and asks the site for nothing.
  await swipe(page, 30);
  await page.waitForTimeout(400);
  await expect(top(page)).toHaveAttribute('aria-label', 'Tomás Reyes, @tomasreyes');

  // The ✕ does the same as a swipe.
  await top(page)
    .getByRole('button', { name: /^Not interested/ })
    .click();
  await expect(top(page)).toHaveAttribute('aria-label', 'Minji Kim, @minjikim');

  expect(await seen(page)).toEqual({ follows: [], dismissals: ['adapark', 'tomasreyes'] });
  expect(errors).toEqual([]);
});

test('following goes through the site’s own button, and someone followed is never dismissed', async ({ page }) => {
  await addWhoToFollow(page);

  await top(page).getByRole('button', { name: 'Follow @adapark' }).click();
  await expect(top(page).getByRole('button', { name: 'Unfollow @adapark' })).toHaveText('Following');

  await swipe(page, 200);
  await expect.poll(() => stack(page)).toEqual(['Tomás Reyes', 'Minji Kim', 'Ada Park']);

  expect(await seen(page)).toEqual({ follows: ['adapark'], dismissals: [] });
});

test('swiping never moves anything around the cards', async ({ page }) => {
  await addWhoToFollow(page);
  await expect.poll(() => stack(page)).toEqual(['Ada Park', 'Tomás Reyes', 'Minji Kim']);

  // Every frame, where the block ends: whatever sits under it would move if it changed.
  await page.evaluate(() => {
    const section = document.querySelector('section[aria-labelledby="aside-who-to-follow"]');
    const ends: number[] = [];
    const watch = (): void => {
      ends.push(Math.round(section?.getBoundingClientRect().bottom ?? 0));
      requestAnimationFrame(watch);
    };

    (window as unknown as { ends: number[] }).ends = ends;
    watch();
  });

  // From someone with a bio, through someone with only a reason, and a newcomer at the back.
  await swipe(page, -200);
  await expect.poll(() => stack(page)).toEqual(['Tomás Reyes', 'Minji Kim', 'Olu Adeyemi']);
  await swipe(page, 200);
  await expect(top(page)).toHaveAttribute('aria-label', 'Minji Kim, @minjikim');
  await swipe(page, 30);
  await page.waitForTimeout(400);

  const ends = await page.evaluate(() => (window as unknown as { ends: number[] }).ends);

  expect(new Set(ends).size).toBe(1);
});

test('the next card rises with the drag, buttons and all, and sinks back if the swipe is undone', async ({ page }) => {
  await addWhoToFollow(page);
  await expect.poll(() => stack(page)).toEqual(['Ada Park', 'Tomás Reyes', 'Minji Kim']);

  const next = deck(page).locator('.card[data-depth="1"]');
  const scale = () => next.evaluate((card) => new DOMMatrix(getComputedStyle(card).transform).a);
  const box = await top(page).locator('.picture').boundingBox();

  if (box === null) {
    throw new Error('The card is not on screen.');
  }

  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];

  await page.mouse.move(x, y);
  await page.mouse.down();

  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(x - step * 20, y);
  }

  // Dragged far enough to go: the next card is all the way up, with its own buttons.
  expect(await scale()).toBeCloseTo(1);
  await expect(next.getByRole('button', { includeHidden: true })).toHaveCount(2);

  // Brought back and let go: it sinks back to its place, and nobody is dismissed.
  for (let step = 9; step >= 0; step--) {
    await page.mouse.move(x - step * 20, y);
  }

  await page.mouse.up();
  await expect.poll(scale).toBeCloseTo(0.95);
  await expect(top(page)).toHaveAttribute('aria-label', 'Ada Park, @adapark');
  expect(await seen(page)).toEqual({ follows: [], dismissals: [] });
});

const refreshes = (page: Page) =>
  page.evaluate(() => (window as unknown as { counts: { refreshes: number } }).counts.refreshes);

test('swiping never runs out: once it runs low, the site’s next people come', async ({ page }) => {
  await addWhoToFollow(page, [
    { username: 'priya', name: 'Priya Nair', bio: 'databases and dry humour', lane: 2 },
    { username: 'jonas', name: 'Jonas Berg', reason: '40 followers', lane: 3 },
    { username: 'lena', name: 'Lena Fischer', lane: 5 },
  ]);
  await expect.poll(() => stack(page)).toEqual(['Ada Park', 'Tomás Reyes', 'Minji Kim']);

  // The one spare takes the first place; after that, the stack is low, and the site is asked for its next people.
  await swipe(page, -200);
  await expect.poll(() => stack(page)).toEqual(['Tomás Reyes', 'Minji Kim', 'Olu Adeyemi']);
  expect(await refreshes(page)).toBe(0);

  await swipe(page, -200);
  await expect.poll(() => stack(page)).toEqual(['Priya Nair', 'Jonas Berg', 'Lena Fischer']);
  expect(await refreshes(page)).toBe(1);
});

test('nudges a moment after it shows, so it is plain the cards can be swiped', async ({ page }) => {
  await addWhoToFollow(page);
  await expect.poll(() => stack(page)).toEqual(['Ada Park', 'Tomás Reyes', 'Minji Kim']);

  await expect
    .poll(() => top(page).evaluate((card) => card.getAnimations().length), { timeout: 8_000 })
    .toBeGreaterThan(0);
  expect(await seen(page)).toEqual({ follows: [], dismissals: [] });
});
