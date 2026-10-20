import type { BrowserContext, Page, Request, Worker } from '@playwright/test';

import { composersHtml } from '../tests/fixtures/site';

import { expect, SITE, test } from './fixtures';

/**
 * AI rewrite, end to end in the real browser. The provider's API is faked, so these run without a real key, but
 * everything else is real: the key-entry frame, the vault, the background, and the composer button.
 *
 * Composers need a signed-in account, so the composer tests use a page that mirrors their markup, served at a
 * dev-null.sh URL so the extension runs on it as it would on the real site.
 */

// Built at runtime so the fake key does not trip secret scanners.
const KEY = `sk-${'e2etest'.repeat(4)}`;
const FIXTURE = 'https://dev-null.sh/__dnpp-test/composer';

interface FakeProvider {
  completions: Request[];
  /** The next reply: a rewrite, `unchanged`, or an HTTP error. */
  reply: (next: Reply) => void;
}

type Reply = { rewritten: string } | 'unchanged' | { status: number };

async function fakeOpenAi(context: BrowserContext): Promise<FakeProvider> {
  const completions: Request[] = [];
  let next: Reply = { rewritten: 'Shipped the new parser.' };

  await context.route('https://api.openai.com/v1/models', (route) =>
    route.fulfill({ json: { data: [{ id: 'gpt-5-mini' }, { id: 'gpt-5' }, { id: 'text-embedding-3-small' }] } }),
  );
  await context.route('https://api.openai.com/v1/chat/completions', (route) => {
    completions.push(route.request());

    if (typeof next === 'object' && 'status' in next) {
      return route.fulfill({ status: next.status, json: { error: { message: `Bad key ${KEY}` } } });
    }

    // A real provider answers in the JSON shape the prompt asks for.
    const content =
      next === 'unchanged' ? { status: 'unchanged', text: '' } : { status: 'rewritten', text: next.rewritten };

    return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(content) } }] } });
  });

  return {
    completions,
    reply: (reply) => {
      next = reply;
    },
  };
}

async function serveComposerFixture(context: BrowserContext): Promise<void> {
  await context.route(FIXTURE, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><title>Composer</title></head><body><div id="app"><main data-main>${composersHtml()}</main></div></body></html>`,
    }),
  );
}

/** Connects OpenAI through the real key-entry page, opened directly. */
async function connect(context: BrowserContext, background: Worker): Promise<void> {
  const extensionId = new URL(background.url()).host;
  const vault = await context.newPage();

  await vault.goto(`chrome-extension://${extensionId}/vault.html`);
  await vault.getByLabel('Provider').selectOption('openai');
  await vault.getByLabel('API key').fill(KEY);
  await vault.getByRole('button', { name: 'Connect' }).click();
  await expect(vault.getByText('Connected to OpenAI')).toBeVisible();
  await vault.close();
}

const aiButton = (page: Page) => page.locator('[data-test="commit-composer"] [data-test="dnpp-ai-button"]');
const commitDraft = (page: Page) => page.locator('#body');

test.describe('settings', () => {
  test('connects a provider in the settings page, without the key ever reaching the page', async ({
    page,
    context,
    background,
  }) => {
    await fakeOpenAi(context);
    await page.goto(`${SITE}#dev-null-plus-plus`);

    const frame = page.frameLocator('iframe[title="AI provider"]');

    await frame.getByLabel('Provider').selectOption('openai');
    await frame.getByLabel('API key').fill(KEY);
    await frame.getByRole('button', { name: 'Connect' }).click();
    await expect(frame.getByText('Connected to OpenAI')).toBeVisible();
    await expect(frame.getByLabel('Model')).toHaveValue('gpt-5-mini');

    // The page, including our settings page in it, never holds the key. Only the frame and the vault do.
    expect(await page.content()).not.toContain(KEY);

    const stored = await background.evaluate(() =>
      (
        globalThis as unknown as { chrome: { storage: { local: { get: () => Promise<unknown> } } } }
      ).chrome.storage.local.get(),
    );

    expect(stored).toEqual({ aiStatus: { provider: 'openai', model: 'gpt-5-mini' } });
    expect(JSON.stringify(stored)).not.toContain(KEY);

    await frame.getByRole('button', { name: 'Disconnect' }).click();
    await expect(frame.getByRole('button', { name: 'Connect' })).toBeVisible();
  });

  test('the switch turns the feature off and hides the provider frame', async ({ page }) => {
    await page.goto(`${SITE}#dev-null-plus-plus`);

    const toggle = page.getByRole('radiogroup', { name: 'Rewrite with AI' });
    const off = toggle.getByRole('radio', { name: 'Off' });

    await off.click();
    await expect(off).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('iframe[title="AI provider"]')).toBeHidden();

    await toggle.getByRole('radio', { name: 'On' }).click();
    await expect(page.locator('iframe[title="AI provider"]')).toBeVisible();
  });
});

test.describe('composer', () => {
  test('has no AI button until a provider is connected', async ({ page, context }) => {
    await serveComposerFixture(context);
    await page.goto(FIXTURE);
    await expect(page.locator('[data-test="schedule-toggle"]')).toBeVisible();

    await expect(page.locator('[data-test="dnpp-ai-button"]')).toHaveCount(0);
  });

  test('rewrites a draft through the background, then undoes it', async ({ page, context, background }) => {
    const provider = await fakeOpenAi(context);

    await serveComposerFixture(context);
    await connect(context, background);
    await page.goto(FIXTURE);
    await expect(page.locator('[data-test="dnpp-ai-button"]')).toHaveCount(2);

    await commitDraft(page).fill('shipd the new parser lol');
    await aiButton(page).click();
    await expect(aiButton(page)).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Improve' }).click();

    await expect(commitDraft(page)).toHaveValue('Shipped the new parser.');
    await expect(page.getByText('Rewritten.')).toBeVisible();

    // The background made the request, with the stored key and the user's draft, fenced in the prompt.
    expect(provider.completions).toHaveLength(1);

    const sent = provider.completions[0];
    const body = sent?.postDataJSON() as {
      model: string;
      messages: { role: string; content: string }[];
      response_format?: unknown;
    };

    expect(sent?.headers().authorization).toBe(`Bearer ${KEY}`);
    expect(body.model).toBe('gpt-5-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[1]?.content).toContain('<draft>\nshipd the new parser lol\n</draft>');
    expect(await page.content()).not.toContain(KEY);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(commitDraft(page)).toHaveValue('shipd the new parser lol');
  });

  test('shows the site’s kind of tooltip on hover', async ({ page, context, background }) => {
    await fakeOpenAi(context);
    await serveComposerFixture(context);
    await connect(context, background);
    await page.goto(FIXTURE);
    await aiButton(page).hover();

    const tooltip = page.getByRole('tooltip');

    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('Rewrite with AI');
    await expect(aiButton(page)).not.toHaveAttribute('title');

    // Centred above the button, clear of it.
    const button = await aiButton(page).boundingBox();
    const box = await tooltip.boundingBox();

    expect(box && button && box.y + box.height).toBeLessThan(button?.y ?? 0);
    expect(
      Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - ((button?.x ?? 0) + (button?.width ?? 0) / 2)),
    ).toBeLessThan(2);

    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();
  });

  test('leaves gibberish alone and says so, without any of the model’s words', async ({
    page,
    context,
    background,
  }) => {
    const provider = await fakeOpenAi(context);

    await serveComposerFixture(context);
    await connect(context, background);
    provider.reply('unchanged');
    await page.goto(FIXTURE);
    await commitDraft(page).fill('asdfasdf');
    await aiButton(page).click();
    await page.getByRole('button', { name: 'Improve' }).click();

    await expect(page.getByText('Nothing to rewrite here')).toBeVisible();
    await expect(commitDraft(page)).toHaveValue('asdfasdf');
  });

  test('explains a rejected key without leaking it', async ({ page, context, background }) => {
    const provider = await fakeOpenAi(context);

    await serveComposerFixture(context);
    await connect(context, background);
    provider.reply({ status: 401 });
    await page.goto(FIXTURE);
    await commitDraft(page).fill('draft');
    await aiButton(page).click();
    await page.getByRole('button', { name: 'Improve' }).click();

    await expect(page.getByRole('alert')).toContainText('rejected your API key');
    await expect(commitDraft(page)).toHaveValue('draft');
    expect(await page.content()).not.toContain(KEY);
  });

  test('turning the feature off removes the button straight away', async ({ page, context, background }) => {
    await fakeOpenAi(context);
    await serveComposerFixture(context);
    await connect(context, background);
    await page.goto(FIXTURE);
    await expect(page.locator('[data-test="dnpp-ai-button"]')).toHaveCount(2);

    await background.evaluate(() =>
      (
        globalThis as unknown as { chrome: { storage: { local: { set: (items: unknown) => Promise<void> } } } }
      ).chrome.storage.local.set({ settings: { features: { aiRewrite: false } } }),
    );

    await expect(page.locator('[data-test="dnpp-ai-button"]')).toHaveCount(0);
  });
});
