/**
 * Renders docs/media/themes-{light,dark}.webp, for the README: each theme on the real site, one after another, with
 * its name, crossfading from one to the next.
 *
 * It loads the built extension into Chromium, turns each theme on, and photographs dev-null.sh's latest log, signed
 * out. Before each photograph, the people and their words are swapped for made-up ones, so the README shows nobody's
 * real posts or pictures. Needs `npm run build` first, and libwebp's `img2webp`, like `npm run media`.
 *
 *   npm run media:themes
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { chromium, type Page } from '@playwright/test';

const run = promisify(execFile);

const ROOT = resolve(import.meta.dirname, '../..');
const EXTENSION = join(ROOT, '.output/chrome-mv3');
const OUTPUT = join(ROOT, 'docs/media');
const SITE = 'https://dev-null.sh/log/latest';

const THEMES = [
  ['terminal-modern', 'Terminal Modern'],
  ['neo-tokyo', 'Neo Tokyo'],
  ['encyclopedia', 'Encyclopedia'],
  ['sugar-cloud', 'Sugar Cloud'],
  ['retro-os', 'Retro OS'],
] as const;

/** The page as photographed, and the picture it is scaled to. */
const PAGE = { width: 1280, height: 800 };
const PICTURE = { width: 960, height: 600 };
/** How long each theme holds, and how its crossfade into the next runs. */
const HOLD = 2200;
const FADE_FRAMES = 12;
const FADE_STEP = 40;

/** Made-up people and commits, in place of the real ones. */
const PEOPLE = [
  ['Ada Quinn', 'adaq', 'Shipped dark mode for the docs. Took one line of CSS and three days of arguing.'],
  ['Kai Moreno', 'kaimoreno', 'Rewrote the parser in an afternoon. The tests caught every one of my mistakes.'],
  ['Noor Haddad', 'noorh', 'Hot take: the best refactor is the one you delete.'],
  ['Theo Brandt', 'theob', 'git push --force-with-lease, because I have learned.'],
  ['Mira Sato', 'mirasato', 'Our CI went from nine minutes to two. Ask me how.'],
  ['Leo Okafor', 'leo', 'Pairing today on the new release notes. Coffee is load-bearing.'],
] as const;

/** A face that is nobody's: a soft two-colour circle with an initial. */
function face(name: string, index: number): string {
  const hues = [
    [330, 270],
    [190, 230],
    [30, 350],
    [140, 190],
    [260, 300],
    [45, 15],
  ][index % 6] ?? [200, 260];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${String(hues[0])} 70% 62%)'/><stop offset='1' stop-color='hsl(${String(hues[1])} 70% 48%)'/></linearGradient></defs><rect width='64' height='64' fill='url(%23g)'/><text x='32' y='42' font-family='sans-serif' font-size='28' font-weight='700' fill='white' text-anchor='middle'>${name.charAt(0)}</text></svg>`;

  return `data:image/svg+xml,${svg.replaceAll('<', '%3C').replaceAll('>', '%3E').replaceAll('#', '%23')}`;
}

/** Swaps every commit's author, words and pictures for made-up ones, and hides anything else people posted. */
async function anonymise(page: Page): Promise<void> {
  const faces = PEOPLE.map(([name], index) => face(name, index));

  await page.evaluate(
    ({ people, faces }) => {
      document.querySelectorAll('[data-test="commit"], [data-reply]').forEach((post, index) => {
        const [name, handle, body] = people[index % people.length] ?? people[0];
        const byline = post.querySelector('div:has(> a > time)');
        // The author's name and handle; not the time, and not the hash.
        const links = byline?.querySelectorAll('a:not(:has(time)):not([data-commit-hash] a)') ?? [];

        links.forEach((link) => {
          link.textContent = link.textContent.trim().startsWith('@') ? `@${handle}` : name;
        });

        const words = post.querySelector('[data-commit-body]');

        if (words !== null) {
          words.textContent = body;
        }

        post.querySelectorAll<HTMLImageElement>('[data-slot="avatar"] img, img[alt]').forEach((image) => {
          image.srcset = '';
          image.src = faces[index % faces.length] ?? '';
        });
        // A note that the words were translated, which they no longer are.
        post.querySelectorAll<HTMLElement>('div, p').forEach((element) => {
          if (element.children.length <= 3 && /^Translated from /.test(element.textContent.trim())) {
            element.style.display = 'none';
          }
        });
        // Pictures, videos, polls and quotes people posted, and "Show more" for words that are now short.
        post
          .querySelectorAll<HTMLElement>(
            '[data-test="show-more"], video, iframe, [data-test="commit-images"], [data-test="quoted-commit"], ul, fieldset',
          )
          .forEach((element) => {
            element.style.display = 'none';
          });
      });
    },
    { people: PEOPLE, faces },
  );
}

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: PAGE,
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const page = await context.newPage();
const work = await mkdtemp(join(tmpdir(), 'dnpp-themes-'));

try {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });

    const shots: string[] = [];

    for (const [id] of THEMES) {
      await worker.evaluate(
        (theme) =>
          (
            globalThis as unknown as { chrome: { storage: { local: { set: (items: unknown) => Promise<void> } } } }
          ).chrome.storage.local.set({
            welcomed: true,
            settings: { features: { themes: true }, theme: { preset: theme } },
          }),
        id,
      );
      await page.goto(SITE, { waitUntil: 'networkidle' });
      await page.locator('[data-test="commit"]').first().waitFor();
      await anonymise(page);
      // Fonts, pictures and the theme settle.
      await page.waitForTimeout(1200);

      const shot = join(work, `${scheme}-${id}.png`);

      await page.screenshot({ path: shot });
      shots.push(`data:image/png;base64,${(await readFile(shot)).toString('base64')}`);
    }

    // Each theme, held, then crossfaded into the next, with its name in a corner. Drawn by the browser itself.
    const stage = await context.newPage();

    await stage.setViewportSize(PICTURE);

    const frames: string[] = [];
    const draw = async (from: number, to: number, amount: number, file: string): Promise<void> => {
      await stage.setContent(`<!doctype html><style>
        body { margin: 0; overflow: hidden; font: 600 15px/1 system-ui, sans-serif; }
        img { position: absolute; inset: 0; width: ${String(PICTURE.width)}px; height: ${String(PICTURE.height)}px; }
        .label { position: absolute; right: 44px; bottom: 96px; padding: 9px 14px; border-radius: 999px;
          background: rgb(10 11 13 / 0.82); color: #fff; letter-spacing: 0.01em; }
      </style>
      <img src="${shots[from] ?? ''}"><div class="label" style="opacity:${String(1 - amount)}">${THEMES[from]?.[1] ?? ''}</div>
      <img src="${shots[to] ?? ''}" style="opacity:${String(amount)}"><div class="label" style="opacity:${String(amount)}">${THEMES[to]?.[1] ?? ''}</div>`);
      await stage.screenshot({ path: file });
    };

    for (let index = 0; index < THEMES.length; index++) {
      const next = (index + 1) % THEMES.length;
      const held = join(work, `${scheme}-frame-${String(index)}-hold.png`);

      await draw(index, next, 0, held);
      frames.push('-d', String(HOLD), held);

      for (let step = 1; step <= FADE_FRAMES; step++) {
        const file = join(work, `${scheme}-frame-${String(index)}-${String(step).padStart(2, '0')}.png`);
        // Eased, so the fade starts and ends gently.
        const amount = 0.5 - Math.cos((Math.PI * step) / (FADE_FRAMES + 1)) / 2;

        await draw(index, next, amount, file);
        frames.push('-d', String(FADE_STEP), file);
      }
    }

    await stage.close();

    const output = join(OUTPUT, `themes-${scheme}.webp`);

    // Every frame a keyframe: building frames from the last leaves blocky ghosts on dark gradients.
    await run('img2webp', [
      '-loop',
      '0',
      '-lossy',
      '-q',
      '82',
      '-m',
      '6',
      '-kmin',
      '0',
      '-kmax',
      '1',
      ...frames,
      '-o',
      output,
    ]);
    process.stdout.write(`themes-${scheme}.webp\n`);
  }
} finally {
  await context.close();
  await rm(work, { recursive: true, force: true });
}
