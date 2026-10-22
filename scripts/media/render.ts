/**
 * Renders the welcome's pictures into docs/media, for the README: one animated WebP for each picture and each theme.
 *
 * The pictures are the extension's own code (src/features/welcome/motion), loaded on a page of their own and held at
 * one moment after another, so every frame is exact, however long it takes to draw, and the loop is as smooth as the
 * extension's own. Needs Chromium (`npx playwright install chromium`) and libwebp's `img2webp`, which brew, apt and
 * most other package managers carry as `webp`.
 *
 *   npm run media                       every picture, both themes
 *   npm run media -- rewrite pip        only these
 *   npm run media -- --theme dark       only this theme
 *   npm run media -- --stills 2000,5000 writes PNGs of those moments to .output/stills instead, to look at
 *   npm run media -- rewrite --measure .preset   prints where those pieces are on the 512 by 288 stage, to aim a cursor
 */

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const run = promisify(execFile);

const ROOT = resolve(import.meta.dirname, '../..');
const OUTPUT = join(ROOT, 'docs/media');
const STILLS = join(ROOT, '.output/stills');

const SCENES = ['intro', 'rewrite', 'preview', 'peek', 'pip', 'commits', 'follow', 'outro'];
const THEMES = ['light', 'dark'];

/** 50 frames a second, so every frame is a whole 20 milliseconds, the finest an animated image can say. */
const FPS = 50;
const WIDTH = 960;
const HEIGHT = 540;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    theme: { type: 'string' },
    stills: { type: 'string' },
    measure: { type: 'string' },
    at: { type: 'string', default: '0' },
    quality: { type: 'string', default: '85' },
    keep: { type: 'boolean', default: false },
  },
});

const scenes = positionals.length > 0 ? positionals : SCENES;
const themes = values.theme === undefined ? THEMES : [values.theme];

const server = await createServer({
  root: join(ROOT, 'scripts/media'),
  configFile: false,
  logLevel: 'error',
  resolve: { alias: { '@': join(ROOT, 'src') } },
  server: { port: 0, fs: { allow: [ROOT] } },
});

await server.listen();

const origin = server.resolvedUrls?.local[0];
const browser = await chromium.launch();

/** Draws one picture in one theme, on a page of its own so several can be drawn at once. */
async function render(scene: string, theme: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

  try {
    await page.goto(`${origin}stage.html?scene=${scene}&theme=${theme}`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() =>
      Promise.all(
        ['400', '500', '600'].flatMap((weight) => [
          document.fonts.load(`${weight} 14px "Geist Sans"`),
          document.fonts.load(`${weight} 12px "Geist Mono"`),
        ]),
      ),
    );

    const { duration } = await page.evaluate(() => window.stage);
    const frame = async (at: number, path: string): Promise<void> => {
      await page.evaluate((moment) => {
        window.stage.seek(moment);
      }, at);
      await page.screenshot({ path, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    };

    if (values.measure !== undefined) {
      const rects = await page.evaluate(
        ([selector, moment]) => {
          window.stage.seek(Number(moment));

          const root = document.querySelector('#stage')?.shadowRoot;
          const stage = root?.querySelector('.stage');

          if (root === null || root === undefined || stage === null || stage === undefined) {
            return [];
          }

          const origin = stage.getBoundingClientRect();
          const fit = origin.width / 512;

          return [...root.querySelectorAll(String(selector))].map((element) => {
            const box = element.getBoundingClientRect();
            const round = (value: number): number => Math.round(value * 10) / 10;

            return {
              text: element.textContent.trim().slice(0, 24),
              x: round((box.left - origin.left) / fit),
              y: round((box.top - origin.top) / fit),
              w: round(box.width / fit),
              h: round(box.height / fit),
              centre: [
                round((box.left + box.width / 2 - origin.left) / fit),
                round((box.top + box.height / 2 - origin.top) / fit),
              ],
            };
          });
        },
        [values.measure, values.at],
      );

      process.stdout.write(`${scene}: ${JSON.stringify(rects)}\n`);

      return;
    }

    if (values.stills !== undefined) {
      await mkdir(STILLS, { recursive: true });

      for (const at of values.stills.split(',').map(Number)) {
        await frame(at, join(STILLS, `${scene}-${theme}-${String(at).padStart(5, '0')}.png`));
      }

      return;
    }

    const frames = await mkdtemp(join(tmpdir(), `dnpp-${scene}-${theme}-`));
    const count = Math.round((duration / 1000) * FPS);

    try {
      for (let index = 0; index < count; index++) {
        await frame((index * 1000) / FPS, join(frames, `${String(index).padStart(4, '0')}.png`));
      }

      await mkdir(OUTPUT, { recursive: true });

      const out = join(OUTPUT, `${scene}-${theme}.webp`);
      const files = (await readdir(frames)).sort().map((file) => join(frames, file));

      await run('img2webp', [
        '-loop',
        '0',
        '-lossy',
        '-q',
        values.quality,
        // A keyframe every few frames: between them the encoder only redraws what changed, and left alone it lets
        // small changes pile up into ghosts of what was there before.
        '-kmin',
        '5',
        '-kmax',
        '10',
        '-d',
        String(1000 / FPS),
        ...files,
        '-o',
        out,
      ]);

      const { size } = await stat(out);

      process.stdout.write(`${scene}-${theme}.webp  ${String(count)} frames  ${(size / 1024).toFixed(0)} KB\n`);
    } finally {
      if (values.keep) {
        process.stdout.write(`frames kept in ${frames}\n`);
      } else {
        await rm(frames, { recursive: true, force: true });
      }
    }
  } finally {
    await page.close();
  }
}

try {
  const jobs = scenes.flatMap((scene) => themes.map((theme) => [scene, theme] as const));
  const workers = Array.from({ length: Math.min(availableParallelism(), 4, jobs.length) }, async () => {
    for (let job = jobs.shift(); job !== undefined; job = jobs.shift()) {
      await render(...job);
    }
  });

  await Promise.all(workers);
} finally {
  await browser.close();
  await server.close();
}
