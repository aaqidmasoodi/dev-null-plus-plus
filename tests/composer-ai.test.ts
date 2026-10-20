import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RewriteResult } from '@/core/ai';
import { SettingsStore } from '@/core/settings';
import { ComposerAi, type RewriteRequester } from '@/features/ai-rewrite/composer-ai';
import type { ExtensionState } from '@/features/ai-rewrite/state';
import { findComposers, setComposerText } from '@/site/composer';

import { composersHtml } from './fixtures/site';

const connected: ExtensionState = {
  settings: { features: { aiRewrite: true } },
  ai: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
};

const commitTextarea = (): HTMLTextAreaElement => {
  const textarea = document.querySelector<HTMLTextAreaElement>('#body');

  if (textarea === null) {
    throw new Error('No commit textarea.');
  }

  return textarea;
};
const aiButtons = (): HTMLButtonElement[] => [
  ...document.querySelectorAll<HTMLButtonElement>('[data-test="dnpp-ai-button"]'),
];
const commitButton = (): HTMLButtonElement => {
  const button = aiButtons()[0];

  if (button === undefined) {
    throw new Error('No AI button.');
  }

  return button;
};
const host = (): HTMLElement | null => document.getElementById(commitButton().getAttribute('aria-controls') ?? '');
const panel = (): ShadowRoot | null | undefined => host()?.shadowRoot;
const preset = (label: string): HTMLButtonElement | undefined =>
  [...(panel()?.querySelectorAll<HTMLButtonElement>('.preset') ?? [])].find(
    (button) => button.textContent.trim() === label,
  );
const input = (): HTMLInputElement | null | undefined => panel()?.querySelector<HTMLInputElement>('.input');
const pressEnter = (): void => {
  input()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
};
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe.each([
  { shape: 'the live markup, with each button wrapped', wrapped: true },
  { shape: 'the source markup, with bare buttons', wrapped: false },
])('ComposerAi on $shape', ({ wrapped }) => {
  let store: SettingsStore<ExtensionState>;
  let request: ReturnType<typeof vi.fn<RewriteRequester>>;
  let composerAi: ComposerAi;

  beforeEach(() => {
    document.body.innerHTML = composersHtml({ wrapped });
    store = new SettingsStore(connected);
    request = vi.fn<RewriteRequester>(() =>
      Promise.resolve<RewriteResult>({ ok: true, changed: true, text: 'Shipped the new parser.' }),
    );
    composerAi = new ComposerAi({ store, request });
  });

  afterEach(() => {
    composerAi.destroy();
    document.body.innerHTML = '';
  });

  /** The element a toolbar button sits in: its wrapper on the live site, or itself. */
  const slotOf = (button: Element): Element => (wrapped ? (button.parentElement ?? button) : button);

  it('adds a button to every composer, right after its last toolbar icon, wrapped like its neighbours', () => {
    composerAi.ensure();

    const [commit, reply] = aiButtons();
    const schedule = document.querySelector('[data-test="schedule-toggle"]');
    const replyImage = document.querySelector('[data-test="reply-composer"] [data-test="attach-images-button"]');

    expect(aiButtons()).toHaveLength(2);
    expect(commit && slotOf(commit).previousElementSibling).toBe(schedule && slotOf(schedule));
    expect(reply && slotOf(reply).previousElementSibling).toBe(replyImage && slotOf(replyImage));

    if (wrapped) {
      expect(commit?.parentElement?.className).toBe('inline-flex shrink-0');
      expect(commit?.parentElement?.childElementCount).toBe(1);
    }
  });

  it('looks like the site’s own toolbar buttons', () => {
    composerAi.ensure();

    const [commit, reply] = aiButtons();

    expect(commit?.className).toContain('aria-expanded:bg-primary-soft');
    expect(commit?.className).not.toContain('-ml-2');
    expect(reply?.className).toContain('size-8');
    expect(reply?.className).toContain('aria-expanded:bg-primary-soft');
    expect(commit?.querySelector('svg')?.getAttribute('class')).toBe('size-5');
    expect(commit?.getAttribute('aria-label')).toBe('Rewrite with AI');
  });

  it('toggles its panel above the whole toolbar row, which stays as it was', () => {
    composerAi.ensure();

    const row = document.querySelector('[data-test="create-commit-button"]')?.parentElement;
    const rowChildren = row === null || row === undefined ? [] : [...row.children];

    commitButton().click();

    expect(commitButton().getAttribute('aria-expanded')).toBe('true');
    expect(host()?.nextElementSibling).toBe(row);
    expect(row === null || row === undefined ? [] : [...row.children]).toEqual(rowChildren);

    commitButton().click();

    expect(commitButton().getAttribute('aria-expanded')).toBe('false');
    expect(host()).toBeNull();
  });

  it('shows a title, a quiet signature, a field and the presets, but no model', () => {
    composerAi.ensure();
    commitButton().click();

    expect(panel()?.querySelector('.title')?.textContent).toBe('Rewrite');
    expect(panel()?.querySelector('.brand')?.textContent).toBe('/dev/null++');
    expect(input()?.placeholder).toContain('How should it read?');
    expect([...(panel()?.querySelectorAll('.preset') ?? [])].map((button) => button.textContent.trim())).toEqual([
      'Improve',
      'Shorten',
      'Fix grammar',
      'Casual',
      'Professional',
    ]);
    expect(panel()?.textContent).not.toContain('llama');
    expect(panel()?.textContent).not.toContain('Groq');
  });

  it('shows nothing when the feature is off or no provider is connected', () => {
    store.set({ ...connected, ai: null });
    composerAi.ensure();
    expect(aiButtons()).toHaveLength(0);

    store.set({ ...connected, settings: { features: { aiRewrite: false } } });
    composerAi.ensure();
    expect(aiButtons()).toHaveLength(0);
  });

  it('removes its buttons, wrappers included, when the feature is turned off', () => {
    composerAi.ensure();
    store.set({ ...connected, settings: { features: { aiRewrite: false } } });
    composerAi.ensure();

    expect(aiButtons()).toHaveLength(0);
    expect(document.querySelectorAll('[data-dnpp]')).toHaveLength(0);
  });

  it('rewrites with a preset and offers Undo', async () => {
    composerAi.ensure();
    setComposerText(commitTextarea(), 'shipd new parser');
    commitButton().click();
    preset('Improve')?.click();

    expect(commitTextarea().readOnly).toBe(true);
    expect(panel()?.textContent).toContain('Rewriting');
    expect(input()?.disabled).toBe(true);

    await settle();

    expect(request).toHaveBeenCalledWith({
      text: 'shipd new parser',
      mode: 'improve',
      instruction: '',
      maxLength: 4500,
    });
    expect(commitTextarea().value).toBe('Shipped the new parser.');
    expect(commitTextarea().readOnly).toBe(false);
    expect(panel()?.textContent).toContain('Rewritten.');

    [...(panel()?.querySelectorAll<HTMLButtonElement>('.link') ?? [])].find((b) => b.textContent === 'Undo')?.click();

    expect(commitTextarea().value).toBe('shipd new parser');
  });

  it('rewrites the way the user asks when they type it and press Enter', async () => {
    composerAi.ensure();
    setComposerText(commitTextarea(), 'shipd new parser');
    commitButton().click();

    const field = input();

    if (field) {
      field.value = '  punchier, with a bit of humour ';
    }

    pressEnter();
    await settle();

    expect(request).toHaveBeenCalledWith({
      text: 'shipd new parser',
      mode: 'custom',
      instruction: 'punchier, with a bit of humour',
      maxLength: 4500,
    });
  });

  it('improves when Enter is pressed with nothing typed', async () => {
    composerAi.ensure();
    setComposerText(commitTextarea(), 'draft');
    commitButton().click();
    pressEnter();
    await settle();

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ mode: 'improve', instruction: '' }));
  });

  it('keeps what was typed in the field through a rewrite', async () => {
    composerAi.ensure();
    setComposerText(commitTextarea(), 'draft');
    commitButton().click();

    const field = input();

    if (field) {
      field.value = 'shorter please';
    }

    pressEnter();
    await settle();

    expect(input()).toBe(field);
    expect(input()?.value).toBe('shorter please');
  });

  it('tells React about the new text, as typing would', async () => {
    const onInput = vi.fn();

    composerAi.ensure();
    commitTextarea().addEventListener('input', onInput);
    setComposerText(commitTextarea(), 'draft');
    commitButton().click();
    preset('Shorten')?.click();
    await settle();

    expect(onInput).toHaveBeenCalledTimes(2);
  });

  it('explains failures, and links to settings when that is where the fix is', async () => {
    request.mockResolvedValueOnce({ ok: false, error: 'auth' });
    composerAi.ensure();
    setComposerText(commitTextarea(), 'draft');
    commitButton().click();
    preset('Improve')?.click();
    await settle();

    expect(panel()?.textContent).toContain('rejected your API key');
    expect(panel()?.querySelector('a.link')?.getAttribute('href')).toBe('#dev-null-plus-plus');
    expect(commitTextarea().value).toBe('draft');
  });

  it('asks for a draft before sending anything', () => {
    composerAi.ensure();
    commitButton().click();
    preset('Improve')?.click();

    expect(request).not.toHaveBeenCalled();
    expect(panel()?.textContent).toContain('Write something first.');
  });

  it('sends nothing for a draft with no letters or digits', () => {
    composerAi.ensure();
    setComposerText(commitTextarea(), '... !!!');
    commitButton().click();
    preset('Improve')?.click();

    expect(request).not.toHaveBeenCalled();
    expect(panel()?.textContent).toContain('Write something first.');
  });

  it.each([
    ['nothing', 'Nothing to rewrite here'],
    ['same', 'Already reads well'],
  ] as const)('leaves the draft alone and says so in its own words (%s)', async (reason, message) => {
    request.mockResolvedValueOnce({ ok: true, changed: false, reason });
    composerAi.ensure();
    setComposerText(commitTextarea(), 'asdfasdf');
    commitButton().click();
    preset('Improve')?.click();
    await settle();

    expect(commitTextarea().value).toBe('asdfasdf');
    expect(commitTextarea().readOnly).toBe(false);
    expect(panel()?.querySelector('.status')?.textContent).toContain(message);
    expect(panel()?.textContent).not.toContain('Undo');
  });

  it('comes back when React re-renders the toolbar', () => {
    composerAi.ensure();
    slotOf(commitButton()).remove();
    composerAi.ensure();

    const schedule = document.querySelector('[data-test="schedule-toggle"]');

    expect(aiButtons()).toHaveLength(2);
    expect(slotOf(commitButton()).previousElementSibling).toBe(schedule && slotOf(schedule));
  });

  it('cleans up when a composer goes away', () => {
    composerAi.ensure();
    document.querySelector('[data-test="reply-composer"]')?.remove();
    composerAi.ensure();

    expect(aiButtons()).toHaveLength(1);
  });

  it('removes buttons left by an earlier copy of the extension', () => {
    composerAi.ensure();

    const stale = new ComposerAi({ store, request });

    stale.ensure();

    expect(aiButtons()).toHaveLength(2);
    stale.destroy();
  });

  describe('tooltip', () => {
    const tooltip = (): HTMLElement | null => document.querySelector('[data-dnpp="tooltip"]');
    const trigger = (): Element => slotOf(commitButton());

    it('shows the site’s kind of tooltip on hover, not the browser’s', () => {
      composerAi.ensure();

      expect(commitButton().hasAttribute('title')).toBe(false);

      trigger().dispatchEvent(new Event('pointerenter'));

      expect(tooltip()?.getAttribute('role')).toBe('tooltip');
      expect(tooltip()?.shadowRoot?.querySelector('.tip')?.textContent).toBe('Rewrite with AI');
      expect(tooltip()?.parentElement).toBe(document.body);
      expect(commitButton().getAttribute('aria-describedby')).toBe(tooltip()?.id);

      trigger().dispatchEvent(new Event('pointerleave'));

      expect(tooltip()).toBeNull();
      expect(commitButton().hasAttribute('aria-describedby')).toBe(false);
    });

    it('shows on keyboard focus too', () => {
      composerAi.ensure();
      commitButton().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      expect(tooltip()).not.toBeNull();
    });

    it('keeps its name while the panel is open', () => {
      composerAi.ensure();
      commitButton().click();
      trigger().dispatchEvent(new Event('pointerenter'));

      expect(tooltip()?.shadowRoot?.querySelector('.tip')?.textContent).toBe('Rewrite with AI');
    });

    it('hides on press and on Escape', () => {
      composerAi.ensure();
      trigger().dispatchEvent(new Event('pointerenter'));
      trigger().dispatchEvent(new Event('pointerdown'));
      expect(tooltip()).toBeNull();

      trigger().dispatchEvent(new Event('pointerenter'));
      commitButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(tooltip()).toBeNull();
    });

    it('shows one at a time, and goes with the button', () => {
      composerAi.ensure();

      for (const button of aiButtons()) {
        slotOf(button).dispatchEvent(new Event('pointerenter'));
      }

      expect(document.querySelectorAll('[data-dnpp="tooltip"]')).toHaveLength(1);

      composerAi.destroy();

      expect(tooltip()).toBeNull();
    });
  });

  it('keeps key presses in the panel away from the site’s shortcuts', () => {
    const siteShortcut = vi.fn();

    composerAi.ensure();
    commitButton().click();
    document.addEventListener('keydown', siteShortcut);
    input()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, composed: true }));
    document.removeEventListener('keydown', siteShortcut);

    expect(siteShortcut).not.toHaveBeenCalled();
  });
});

describe('findComposers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each([true, false])('finds the parts whether or not buttons are wrapped (wrapped: %s)', (wrapped) => {
    document.body.innerHTML = composersHtml({ wrapped });

    const [commit, reply] = findComposers();
    const submit = document.querySelector('[data-test="create-commit-button"]');

    expect([commit?.kind, reply?.kind]).toEqual(['commit-composer', 'reply-composer']);
    expect(commit?.textarea.id).toBe('body');
    expect(commit?.anchor.getAttribute('data-test')).toBe('schedule-toggle');
    expect(commit?.slot).toBe(wrapped ? commit?.anchor.parentElement : commit?.anchor);
    expect(commit?.toolbar).toBe(submit?.parentElement);
  });

  it('skips composers missing the parts it needs', () => {
    document.body.innerHTML = '<form data-test="commit-composer"><textarea name="body"></textarea></form>';

    expect(findComposers()).toEqual([]);
  });
});
