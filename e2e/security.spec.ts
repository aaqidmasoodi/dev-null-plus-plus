import { AI_PROVIDER_ORIGINS, EXTENSION_PAGES_CSP } from '../src/core/constants';

import { expect, SITE, test } from './fixtures';

/**
 * Guards the extension's security boundaries in the real browser. A change that widens permissions, loosens the
 * extension's CSP or opens a message channel to pages fails here.
 */

test('asks for no more permissions than it needs', async ({ background }) => {
  const manifest = await background.evaluate(() =>
    (
      globalThis as unknown as { chrome: { runtime: { getManifest: () => Browser.runtime.Manifest } } }
    ).chrome.runtime.getManifest(),
  );

  expect(manifest.permissions).toEqual(['scripting', 'storage', 'webNavigation']);
  expect(manifest.host_permissions).toEqual(['https://dev-null.sh/*']);
  expect(manifest.optional_permissions ?? []).toEqual([]);
  // Only Groq, which does not answer CORS, and only when the user chooses it.
  expect(manifest.optional_host_permissions).toEqual(['https://api.groq.com/*']);
  // Only the key-entry page, only to dev-null.sh, behind a per-session URL.
  expect(manifest.web_accessible_resources).toEqual([
    { resources: ['vault.html'], matches: ['https://dev-null.sh/*'], use_dynamic_url: true },
  ]);
  expect(manifest.externally_connectable).toEqual({ ids: [] });
  expect(manifest.content_scripts?.flatMap((script) => script.matches)).toEqual([
    'https://dev-null.sh/*',
    'https://dev-null.sh/*',
  ]);
  expect(manifest.content_scripts?.some((script) => script.all_frames === true)).toBe(false);
});

test('pins the strict extension CSP', async ({ background }) => {
  // Checked as declared, because DevTools-driven code (which is how Playwright runs code in the worker) is exempt from
  // CSP's eval rules, so they cannot be exercised from here.
  const manifest = await background.evaluate(() =>
    (
      globalThis as unknown as { chrome: { runtime: { getManifest: () => Browser.runtime.Manifest } } }
    ).chrome.runtime.getManifest(),
  );
  const csp = (manifest.content_security_policy as { extension_pages?: string } | undefined)?.extension_pages;

  expect(csp).toBe(EXTENSION_PAGES_CSP);
  expect(csp).not.toMatch(/unsafe|\*|data:|blob:|http:/);

  // Network access is the AI providers' API origins and nothing else, and only dev-null.sh may frame our pages.
  const connect = /connect-src ([^;]+)/.exec(csp ?? '')?.[1]?.split(' ');

  expect(connect?.sort()).toEqual([...AI_PROVIDER_ORIGINS].sort());
  expect(csp).toContain('frame-ancestors https://dev-null.sh;');
});

test('the service worker cannot reach anything but the AI providers', async ({ background }) => {
  const result = await background.evaluate(() =>
    fetch('https://example.com/').then(
      () => 'reached the network',
      () => 'blocked',
    ),
  );

  expect(result).toBe('blocked');
});

test('dev-null.sh cannot message the extension', async ({ page, background }) => {
  const extensionId = new URL(background.url()).host;

  await page.goto(SITE);

  const result = await page.evaluate((id) => {
    const runtime = (globalThis as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime;

    if (typeof runtime?.sendMessage !== 'function') {
      return 'no channel';
    }

    try {
      (runtime.sendMessage as (id: string, message: unknown) => void)(id, { type: 'dnpp:open-settings' });

      return 'sent';
    } catch {
      return 'refused';
    }
  }, extensionId);

  expect(['no channel', 'refused']).toContain(result);
});

test('adds nothing to the page outside the settings page and nav item', async ({ page }) => {
  await page.goto(SITE);
  await expect(page.locator('[data-test="dnpp-nav-item"]')).toBeVisible();

  const owned = await page
    .locator('[data-dnpp]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-dnpp')));

  expect(owned.sort()).toEqual(['nav-item']);
});
