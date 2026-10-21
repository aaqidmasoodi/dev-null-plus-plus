/**
 * The Firefox build, in a real Firefox, on the real site. Playwright cannot load extensions into Firefox, so this drives
 * it through Selenium and geckodriver instead: it installs the zipped build as a temporary add-on, as about:debugging
 * does, and checks the extension starts and its pages work. The Chrome suite (Playwright) covers each feature in depth;
 * this makes sure none of it is stopped by a Firefox difference.
 *
 * Run with `npm run test:e2e:firefox`, which builds the zip first. Headless in CI.
 */

import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';

import { Builder, By, until, type WebDriver, type WebElement } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const SITE = 'https://dev-null.sh/log/latest';
const OUTPUT = path.resolve(import.meta.dirname, '../../.output');
const zip = readdirSync(OUTPUT).find((file) => file.endsWith('-firefox.zip'));

assert.ok(zip, 'Build the Firefox zip first: npm run zip:firefox');

/** The text of every heading in our shadow roots. */
const ourHeadings = (driver: WebDriver): Promise<string[]> =>
  driver.executeScript(() =>
    [...document.querySelectorAll('[data-dnpp]')].flatMap((host) =>
      [...(host.shadowRoot?.querySelectorAll('h1, h2') ?? [])].map((heading) => heading.textContent),
    ),
  );

const checks: [string, (driver: WebDriver) => Promise<void>][] = [
  [
    'starts on dev-null.sh once the page has hydrated',
    async (driver) => {
      await driver.get(SITE);
      await driver.wait(until.elementLocated(By.css('[data-dnpp="nav-item"]')), 30_000);
      // Reported by the script that runs in the page's own world, not the fallback after a timeout.
      assert.equal(
        await driver.executeScript(() => document.documentElement.getAttribute('data-dnpp-hydration')),
        'hydrated',
      );
    },
  ],
  [
    'welcomes a new install once, remembered in the extension’s storage',
    async (driver) => {
      await driver.wait(until.elementLocated(By.css('[data-dnpp="welcome"]')), 15_000);
      await driver.actions().sendKeys('').perform();
      await driver.sleep(800);
      await driver.navigate().refresh();
      await driver.wait(until.elementLocated(By.css('[data-dnpp="nav-item"]')), 30_000);
      await driver.sleep(1_500);
      assert.equal((await driver.findElements(By.css('[data-dnpp="welcome"]'))).length, 0);
    },
  ],
  [
    'opens the settings page, with every section',
    async (driver) => {
      await driver.get(`${SITE}#dev-null-plus-plus`);
      await driver.wait(async () => (await ourHeadings(driver)).includes('/dev/null++'), 20_000);

      const headings = await ourHeadings(driver);

      for (const section of ['About', 'Rewrite with AI', 'Image peek', 'Picture-in-picture', 'Who to follow cards']) {
        assert.ok(headings.includes(section), `${section} is missing: ${headings.join(', ')}`);
      }
    },
  ],
  [
    'loads the key-entry frame from the extension’s own origin',
    async (driver) => {
      const src = await driver.wait(
        () =>
          driver.executeScript<string | null>(() => {
            for (const host of document.querySelectorAll('[data-dnpp]')) {
              const frame = host.shadowRoot?.querySelector('iframe');

              if (frame) {
                return frame.src;
              }
            }

            return null;
          }),
        15_000,
      );

      assert.ok(src !== null);
      assert.match(src, /^moz-extension:\/\/[\w-]+\/vault\.html/);

      const frame = await driver.executeScript<WebElement>(() => {
        for (const host of document.querySelectorAll('[data-dnpp]')) {
          const found = host.shadowRoot?.querySelector('iframe');

          if (found) {
            return found;
          }
        }

        return null;
      });

      // Inside the frame: the extension page itself has loaded, with its provider picker.
      await driver.switchTo().frame(frame);
      await driver.wait(until.elementLocated(By.css('select')), 15_000);
      await driver.switchTo().defaultContent();
    },
  ],
];

const options = new firefox.Options().windowSize({ width: 1280, height: 900 });

if (process.env.CI !== undefined) {
  options.addArguments('-headless');
}

if (process.env.FIREFOX_BINARY !== undefined) {
  options.setBinary(process.env.FIREFOX_BINARY);
}

const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
let failed = 0;

try {
  await (driver as firefox.Driver).installAddon(path.join(OUTPUT, zip), true);

  for (const [name, check] of checks) {
    try {
      await check(driver);
      process.stdout.write(`  ✓ ${name}\n`);
    } catch (error) {
      failed++;
      process.stdout.write(`  ✘ ${name}\n    ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
} finally {
  await driver.quit();
}

process.stdout.write(failed === 0 ? `\n  ${String(checks.length)} passed\n` : `\n  ${String(failed)} failed\n`);
process.exitCode = failed === 0 ? 0 : 1;
