import type { Page, Worker } from '@playwright/test';

import { HOOKS } from '../src/themes/hooks';

import { expect, SITE, test } from './fixtures';

/**
 * Themes on the live site, signed out. These are what tell us a site update moved something a theme depends on: the
 * hooks are checked against the real page, every rule a theme compiles to must survive the browser's parser, and each
 * theme's signature look must actually land on real commits.
 */

const PRESETS = ['terminal-modern', 'neo-tokyo', 'encyclopedia', 'sugar-cloud', 'retro-os'] as const;

type Preset = (typeof PRESETS)[number];

async function useTheme(background: Worker, preset: Preset | null): Promise<void> {
  await background.evaluate(
    (theme) =>
      (
        globalThis as unknown as { chrome: { storage: { local: { set: (items: unknown) => Promise<void> } } } }
      ).chrome.storage.local.set({
        settings: { features: { themes: theme !== null }, theme: { preset: theme ?? 'terminal-modern' } },
      }),
    preset,
  );
}

const themeOf = (page: Page) => page.locator('html').getAttribute('data-dnpp-theme');

test('every hook the themes use still matches on the live site', async ({ page }) => {
  await page.goto(SITE);
  await expect(page.locator('[data-test="commit"]').first()).toBeVisible();

  // Only on a profile page, or only when signed in.
  const elsewhere = new Set(['ASIDE_PROFILE']);
  const missing = await page.evaluate((hooks) => {
    return Object.entries(hooks)
      .filter(([, selector]) => document.querySelector(selector) === null)
      .map(([name]) => name);
  }, HOOKS);

  expect(missing.filter((name) => !elsewhere.has(name))).toEqual([]);
});

for (const preset of PRESETS) {
  test(`${preset}: the browser keeps every rule, and nothing on the page breaks`, async ({
    page,
    background,
    errors,
  }) => {
    await useTheme(background, preset);
    await page.goto(SITE);
    await expect.poll(() => themeOf(page)).toBe(preset);

    // Counts the rules in the theme's text and the rules the browser parsed from it. A rule the browser rejects (a
    // nested :has(), a typo) is silently dropped, so the two would differ.
    const counts = await page.evaluate(() => {
      const style = document.querySelector('style[data-dnpp="theme"]');
      const text = (style?.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
      const written = (source: string): number => {
        let count = 0;
        let depth = 0;
        let prelude = '';
        let block = '';

        for (const character of source) {
          if (character === '{') {
            if (depth === 0) {
              const at = prelude.trim();

              count += at.startsWith('@media') || at.startsWith('@supports') ? 0 : 1;
              block = '';
              prelude = at;
            } else {
              block += character;
            }

            depth += 1;
          } else if (character === '}') {
            depth -= 1;

            if (depth === 0) {
              if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
                count += written(block);
              }

              prelude = '';
            } else {
              block += character;
            }
          } else if (depth === 0) {
            prelude += character;
          } else {
            block += character;
          }
        }

        return count;
      };
      const parsed = (rules: CSSRuleList): number =>
        [...rules].reduce(
          (sum, rule) =>
            sum + (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule ? parsed(rule.cssRules) : 1),
          0,
        );

      return {
        written: written(text),
        parsed: style instanceof HTMLStyleElement && style.sheet ? parsed(style.sheet.cssRules) : 0,
      };
    });

    expect(counts.written).toBeGreaterThan(10);
    expect(counts.parsed).toBe(counts.written);
    // Network failures are the site's own (its analytics, blocked in some places); anything else would be ours.
    expect(errors.filter((error) => !error.startsWith('Failed to load resource'))).toEqual([]);
  });
}

test('each theme’s signature look lands on real commits', async ({ page, background }) => {
  const content = page.locator('[data-test="commit"] > div > div:has(a > time):not(:has([data-reply]))').first();
  const byline = content.locator('div:has(> a > time)').first();

  await useTheme(background, 'neo-tokyo');
  await page.goto(SITE);
  await expect.poll(() => themeOf(page)).toBe('neo-tokyo');
  // A speech bubble, with a thick outline.
  await expect(content).toHaveCSS('border-top-width', '3px');

  await useTheme(background, 'retro-os');
  await expect.poll(() => themeOf(page)).toBe('retro-os');
  // A window, with its byline as a title bar.
  await expect(byline).toHaveCSS('background-image', /linear-gradient/);

  await useTheme(background, 'encyclopedia');
  await expect.poll(() => themeOf(page)).toBe('encyclopedia');
  // An article section: the byline in the reading serif, over a rule.
  await expect(byline).toHaveCSS('font-family', /Linux Libertine|Georgia/);
  await expect(byline).toHaveCSS('border-bottom-style', 'solid');

  await useTheme(background, 'sugar-cloud');
  await expect.poll(() => themeOf(page)).toBe('sugar-cloud');
  // Hearts for stars.
  await expect(page.locator('[data-test="star-commit-button"] > svg').first()).toHaveCSS('mask-image', /data:image/);
});

test('a theme is on the page before it is first drawn', async ({ page, background }) => {
  await useTheme(background, 'retro-os');
  // The first visit leaves the choice where the next first paint can read it.
  await page.goto(SITE);
  await expect.poll(() => themeOf(page)).toBe('retro-os');

  await page.addInitScript(() => {
    // This can run before <html> exists, so it watches the whole document for it and its attribute.
    const record = (): void => {
      if (document.querySelector('html')?.getAttribute('data-dnpp-theme') != null) {
        (window as unknown as { themedAt?: number }).themedAt ??= performance.now();
      }
    };

    record();
    new MutationObserver(record).observe(document, { attributes: true, childList: true, subtree: true });
  });
  await page.reload();
  await expect.poll(() => themeOf(page)).toBe('retro-os');

  const timing = await page.evaluate(() => ({
    themedAt: (window as unknown as { themedAt?: number }).themedAt ?? Infinity,
    firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime ?? Infinity,
  }));

  expect(timing.themedAt).toBeLessThan(timing.firstPaint);
});

test('picked on the settings page, a theme applies at once, and Off brings the site’s own look back', async ({
  page,
}) => {
  await page.goto(`${SITE}#dev-null-plus-plus`);

  const picker = page.getByRole('radiogroup', { name: 'Theme', exact: true });

  await expect(picker).toBeVisible();
  await expect(themeOf(page)).resolves.toBeNull();

  await picker.getByRole('radio', { name: /Neo Tokyo/ }).click();
  await expect.poll(() => themeOf(page)).toBe('neo-tokyo');
  await expect(picker.getByRole('radio', { name: /Neo Tokyo/ })).toHaveAttribute('aria-checked', 'true');

  await picker.getByRole('radio', { name: /Encyclopedia/ }).click();
  await expect.poll(() => themeOf(page)).toBe('encyclopedia');

  await page.getByRole('radiogroup', { name: 'Themes', exact: true }).getByRole('radio', { name: 'Off' }).click();
  await expect.poll(() => themeOf(page)).toBeNull();
  await expect(page.locator('style[data-dnpp="theme"]')).toHaveCount(0);
});
