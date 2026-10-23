import type { Page, Worker } from '@playwright/test';

import { expect, SITE, test } from './fixtures';

/** The theme editor on the live site: the brush, the live preview, saving, and leaving without saving. */

async function useTheme(background: Worker, preset: string, brush = true): Promise<void> {
  await background.evaluate(
    ({ theme, themeBrush }) =>
      (
        globalThis as unknown as { chrome: { storage: { local: { set: (items: unknown) => Promise<void> } } } }
      ).chrome.storage.local.set({
        settings: { features: { themes: true, themeBrush }, theme: { preset: theme, custom: null } },
      }),
    { theme: preset, themeBrush: brush },
  );
}

const primary = (page: Page): Promise<string> =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());

test('the brush opens the editor, which previews on this tab only, and saves for every tab', async ({
  page,
  context,
  background,
}) => {
  await useTheme(background, 'neo-tokyo');
  await page.goto(SITE);

  const brush = page.getByRole('button', { name: 'Edit your theme' });

  await expect(brush).toBeVisible();
  await brush.click();

  const editor = page.getByRole('dialog', { name: 'Theme editor' });

  await expect(editor).toBeVisible();
  // The brush steps aside while the editor is open.
  await expect(brush).toBeHidden();
  await expect.poll(() => page.locator('html').getAttribute('data-dnpp-theme')).toBe('custom');

  const other = await context.newPage();

  await other.goto(SITE);
  await expect.poll(() => other.locator('html').getAttribute('data-dnpp-theme')).toBe('neo-tokyo');

  await editor.getByRole('textbox', { name: 'Accent, as hex' }).fill('#0a7d4f');
  await expect.poll(() => primary(page)).toBe('#0a7d4f');
  // A draft stays in its own tab.
  await expect.poll(() => other.locator('html').getAttribute('data-dnpp-theme')).toBe('neo-tokyo');

  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await expect.poll(() => other.locator('html').getAttribute('data-dnpp-theme')).toBe('custom');
  await expect.poll(() => primary(other)).toBe('#0a7d4f');

  await editor.getByRole('button', { name: 'Close' }).click();
  await expect(editor).toBeHidden();
  await expect(brush).toBeVisible();

  await page.reload();
  await expect.poll(() => page.locator('html').getAttribute('data-dnpp-theme')).toBe('custom');
  await expect.poll(() => primary(page)).toBe('#0a7d4f');
});

test('closing without saving asks first, and Discard puts the saved look back', async ({ page, background }) => {
  await useTheme(background, 'retro-os');
  await page.goto(SITE);
  await page.getByRole('button', { name: 'Edit your theme' }).click();

  const editor = page.getByRole('dialog', { name: 'Theme editor' });
  const before = await primary(page);

  await editor.getByRole('textbox', { name: 'Accent, as hex' }).fill('#ff00aa');
  await expect.poll(() => primary(page)).toBe('#ff00aa');

  await page.keyboard.press('Escape');
  await expect(editor.getByText('Keep your changes?')).toBeVisible();
  await editor.getByRole('button', { name: 'Discard' }).click();
  await expect(editor).toBeHidden();
  await expect.poll(() => page.locator('html').getAttribute('data-dnpp-theme')).toBe('retro-os');
  await expect.poll(() => primary(page)).toBe(before);
});

test('a theme pasted in is checked before it is used', async ({ page, background }) => {
  await useTheme(background, 'terminal-modern');
  await page.goto(SITE);
  await page.getByRole('button', { name: 'Edit your theme' }).click();

  const editor = page.getByRole('dialog', { name: 'Theme editor' });

  await editor.getByText('Share', { exact: true }).click();
  await editor.getByRole('textbox', { name: 'Theme JSON' }).fill('{"id":"x","css":"body{display:none}"}');
  await editor.getByRole('button', { name: 'Load' }).click();
  await expect(editor.getByRole('alert')).toContainText('theme.css is not a theme field');
  await expect(page.locator('body')).toBeVisible();
});

test('the brush can be turned off, and is not there while themes are off', async ({ page, background }) => {
  await useTheme(background, 'sugar-cloud', false);
  await page.goto(SITE);
  await expect.poll(() => page.locator('html').getAttribute('data-dnpp-theme')).toBe('sugar-cloud');
  await expect(page.locator('[data-dnpp="theme-brush"]')).toHaveCount(0);

  await useTheme(background, 'sugar-cloud', true);
  await expect(page.getByRole('button', { name: 'Edit your theme' })).toBeVisible();

  await background.evaluate(() =>
    (
      globalThis as unknown as { chrome: { storage: { local: { set: (items: unknown) => Promise<void> } } } }
    ).chrome.storage.local.set({ settings: { features: { themes: false } } }),
  );
  await expect(page.locator('[data-dnpp="theme-brush"]')).toHaveCount(0);
});
