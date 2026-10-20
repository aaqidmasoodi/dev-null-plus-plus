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
const panel = (): ShadowRoot | null | undefined =>
  document.getElementById(commitButton().getAttribute('aria-controls') ?? '')?.shadowRoot;
const option = (label: string): HTMLButtonElement | undefined =>
  [...(panel()?.querySelectorAll<HTMLButtonElement>('.option') ?? [])].find(
    (button) => button.textContent.trim() === label,
  );
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('ComposerAi', () => {
  let store: SettingsStore<ExtensionState>;
  let request: ReturnType<typeof vi.fn<RewriteRequester>>;
  let composerAi: ComposerAi;

  beforeEach(() => {
    document.body.innerHTML = composersHtml();
    store = new SettingsStore(connected);
    request = vi.fn<RewriteRequester>(() =>
      Promise.resolve<RewriteResult>({ ok: true, text: 'Shipped the new parser.' }),
    );
    composerAi = new ComposerAi({ store, request });
  });

  afterEach(() => {
    composerAi.destroy();
    document.body.innerHTML = '';
  });

  it('adds a button to every composer, right after its last toolbar icon', () => {
    composerAi.ensure();

    const [commit, reply] = aiButtons();

    expect(aiButtons()).toHaveLength(2);
    expect(commit?.previousElementSibling?.getAttribute('data-test')).toBe('schedule-toggle');
    expect(reply?.previousElementSibling?.getAttribute('data-test')).toBe('attach-images-button');
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

  it('shows nothing when the feature is off or no provider is connected', () => {
    store.set({ ...connected, ai: null });
    composerAi.ensure();
    expect(aiButtons()).toHaveLength(0);

    store.set({ ...connected, settings: { features: { aiRewrite: false } } });
    composerAi.ensure();
    expect(aiButtons()).toHaveLength(0);
  });

  it('removes its buttons when the feature is turned off', () => {
    composerAi.ensure();
    store.set({ ...connected, settings: { features: { aiRewrite: false } } });
    composerAi.ensure();

    expect(aiButtons()).toHaveLength(0);
  });

  it('opens its panel above the toolbar, like the schedule panel', () => {
    composerAi.ensure();
    commitButton().click();

    const host = document.getElementById(commitButton().getAttribute('aria-controls') ?? '');

    expect(commitButton().getAttribute('aria-expanded')).toBe('true');
    expect(host?.nextElementSibling?.className).toContain('mt-2 flex');
    expect(panel()?.textContent).toContain('Groq · llama-3.3-70b-versatile');
    expect(option('Improve')).toBeDefined();
    expect(option('Fix grammar')).toBeDefined();
  });

  it('rewrites the draft and offers Undo', async () => {
    composerAi.ensure();
    setComposerText(commitTextarea(), 'shipd new parser');
    commitButton().click();
    option('Improve')?.click();

    expect(commitTextarea().readOnly).toBe(true);
    expect(panel()?.textContent).toContain('Rewriting');

    await settle();

    expect(request).toHaveBeenCalledWith({ text: 'shipd new parser', mode: 'improve', maxLength: 4500 });
    expect(commitTextarea().value).toBe('Shipped the new parser.');
    expect(commitTextarea().readOnly).toBe(false);
    expect(panel()?.textContent).toContain('Rewritten.');

    [...(panel()?.querySelectorAll<HTMLButtonElement>('.link') ?? [])].find((b) => b.textContent === 'Undo')?.click();

    expect(commitTextarea().value).toBe('shipd new parser');
  });

  it('tells React about the new text, as typing would', async () => {
    const onInput = vi.fn();

    composerAi.ensure();
    commitTextarea().addEventListener('input', onInput);
    setComposerText(commitTextarea(), 'draft');
    commitButton().click();
    option('Shorten')?.click();
    await settle();

    expect(onInput).toHaveBeenCalledTimes(2);
  });

  it('explains failures, and links to settings when that is where the fix is', async () => {
    request.mockResolvedValueOnce({ ok: false, error: 'auth' });
    composerAi.ensure();
    setComposerText(commitTextarea(), 'draft');
    commitButton().click();
    option('Improve')?.click();
    await settle();

    expect(panel()?.textContent).toContain('rejected your API key');
    expect(panel()?.querySelector('a.link')?.getAttribute('href')).toBe('#dev-null-plus-plus');
    expect(commitTextarea().value).toBe('draft');
  });

  it('asks for a draft before sending anything', () => {
    composerAi.ensure();
    commitButton().click();
    option('Improve')?.click();

    expect(request).not.toHaveBeenCalled();
    expect(panel()?.textContent).toContain('Write something first.');
  });

  it('comes back when React re-renders the toolbar', () => {
    composerAi.ensure();
    commitButton().remove();
    composerAi.ensure();

    expect(aiButtons()).toHaveLength(2);
    expect(commitButton().previousElementSibling?.getAttribute('data-test')).toBe('schedule-toggle');
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

  it('keeps key presses in the panel away from the site’s shortcuts', () => {
    const siteShortcut = vi.fn();

    composerAi.ensure();
    commitButton().click();
    document.addEventListener('keydown', siteShortcut);
    option('Improve')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, composed: true }));
    document.removeEventListener('keydown', siteShortcut);

    expect(siteShortcut).not.toHaveBeenCalled();
  });
});

describe('findComposers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('finds commit and reply composers with their parts', () => {
    document.body.innerHTML = composersHtml();

    const composers = findComposers();

    expect(composers.map((composer) => composer.kind)).toEqual(['commit-composer', 'reply-composer']);
    expect(composers[0]?.textarea.id).toBe('body');
    expect(composers[0]?.anchor.getAttribute('data-test')).toBe('schedule-toggle');
  });

  it('skips composers missing the parts it needs', () => {
    document.body.innerHTML = '<form data-test="commit-composer"><textarea name="body"></textarea></form>';

    expect(findComposers()).toEqual([]);
  });
});
