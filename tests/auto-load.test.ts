import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExtensionState } from '@/core/extension-state';
import { SettingsStore } from '@/core/settings';
import { AutoLoadNewCommits, COVERED_ATTRIBUTE } from '@/features/auto-load/auto-load';
import { feedCommits, findNewCommitsPill, isBusyWithFeed } from '@/site/log';
import { removeTakeover, setTakeover } from '@/site/takeover';

import { logHtml, respondToPillLikeTheSite } from './fixtures/site';

const state = (autoLoadNewCommits = true): ExtensionState => ({
  settings: { features: { aiRewrite: true, autoLoadNewCommits } },
  ai: null,
});

const ours = (): HTMLElement | null => document.querySelector('[data-dnpp="auto-load-pill"]');
const ourText = (): string | undefined => ours()?.shadowRoot?.querySelector('.pill')?.textContent;
const sitePillWrapper = (): Element | null | undefined => findNewCommitsPill()?.button.parentElement;
const scrollTo = (y: number): void => {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
};
const settle = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('the new-commits pill', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is found by its words and its icon', () => {
    document.body.innerHTML = logHtml({ count: 3 });

    expect(findNewCommitsPill()?.count).toBe(3);

    document.body.innerHTML = logHtml({ count: 1 });

    expect(findNewCommitsPill()?.count).toBe(1);
  });

  it('is not confused with other buttons', () => {
    document.body.innerHTML = logHtml();
    document
      .querySelector('[data-nav-content]')
      ?.insertAdjacentElement(
        'beforeend',
        Object.assign(document.createElement('button'), { textContent: 'Show 3 new commits from @someone' }),
      );

    expect(findNewCommitsPill()).toBeNull();
  });

  it('lists only the feed’s own commits, not their replies', () => {
    document.body.innerHTML = logHtml({ ids: ['a', 'b'] });

    expect(feedCommits().map((row) => row.dataset.commit)).toEqual(['a', 'b']);
  });

  it('knows when the user is busy with a reply, a quote or a dialog', () => {
    document.body.innerHTML = logHtml();
    expect(isBusyWithFeed()).toBe(false);

    document.body.insertAdjacentHTML('beforeend', '<form data-test="reply-composer"></form>');
    expect(isBusyWithFeed()).toBe(true);
  });
});

describe('AutoLoadNewCommits', () => {
  let store: SettingsStore<ExtensionState>;
  let controller: AbortController;
  let autoLoad: AutoLoadNewCommits;
  let stopSite: () => void;

  beforeEach(() => {
    history.replaceState(null, '', '/log/latest');
    document.body.innerHTML = logHtml({ count: 2 });
    scrollTo(0);
    store = new SettingsStore(state());
    controller = new AbortController();
    autoLoad = new AutoLoadNewCommits({ store, signal: controller.signal });
    stopSite = respondToPillLikeTheSite(['c5', 'c4']);
  });

  afterEach(() => {
    stopSite();
    autoLoad.destroy();
    controller.abort();
    removeTakeover();
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
    vi.useRealTimers();
  });

  it('loads them as if clicked when the reader is at the top, showing "Fetching…" over the site’s pill', async () => {
    const click = vi.fn();

    findNewCommitsPill()?.button.addEventListener('click', click);
    autoLoad.ensure();

    expect(click).toHaveBeenCalledOnce();
    expect(autoLoad.state).toBe('fetching');
    expect(ourText()).toBe('Fetching 2 new commits…');
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(true);

    await settle(700);

    expect(feedCommits().map((row) => row.dataset.commit)).toEqual(['c5', 'c4', 'c3', 'c2', 'c1']);
    expect(ourText()).toBe('2 new commits loaded');
  });

  it('keeps going when the site’s own reload reports a navigation on the log', async () => {
    autoLoad.ensure();
    await settle(0);

    expect(autoLoad.state).not.toBe('idle');
  });

  it('goes back to idle once the pill has faded', async () => {
    autoLoad.ensure();
    await settle(2200);

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
  });

  it('does not reload or move the page when the reader is scrolled down', () => {
    const click = vi.fn();
    const scroll = vi.spyOn(window, 'scrollTo');

    scrollTo(900);
    findNewCommitsPill()?.button.addEventListener('click', click);
    autoLoad.ensure();

    expect(click).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
    expect(autoLoad.state).toBe('waiting');
    expect(ourText()).toBe('2 new commits above');
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(true);
  });

  it('loads them as soon as the reader is back at the top', () => {
    const click = vi.fn();

    scrollTo(900);
    findNewCommitsPill()?.button.addEventListener('click', click);
    autoLoad.ensure();
    scrollTo(40);
    autoLoad.ensure();

    expect(click).toHaveBeenCalledOnce();
    expect(autoLoad.state).toBe('fetching');
  });

  it('scrolls to the top when our waiting pill is clicked', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    scrollTo(900);
    autoLoad.ensure();
    ours()?.shadowRoot?.querySelector<HTMLButtonElement>('.pill')?.click();

    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('keeps the count up to date while waiting', () => {
    scrollTo(900);
    autoLoad.ensure();

    const button = findNewCommitsPill()?.button;

    if (button) {
      button.lastChild?.replaceWith('5 new commits');
    }

    autoLoad.ensure();

    expect(ourText()).toBe('5 new commits above');
  });

  it.each([
    [
      'a reply is being written',
      () => {
        document.body.insertAdjacentHTML('beforeend', '<form data-test="reply-composer"></form>');
      },
    ],
    [
      'a dialog is open',
      () => {
        document.body.insertAdjacentHTML('beforeend', '<div role="dialog"></div>');
      },
    ],
    [
      'the settings page is showing',
      () => {
        setTakeover('settings-page');
      },
    ],
  ])('keeps its hands off while %s', (_, arrange) => {
    const click = vi.fn();

    arrange();
    findNewCommitsPill()?.button.addEventListener('click', click);
    autoLoad.ensure();

    expect(click).not.toHaveBeenCalled();
    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(false);
  });

  it('waits for the tab to be in view', () => {
    const click = vi.fn();

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    findNewCommitsPill()?.button.addEventListener('click', click);
    autoLoad.ensure();

    expect(click).not.toHaveBeenCalled();
  });

  it('does nothing when switched off, and gives the site its pill back if it was waiting', () => {
    scrollTo(900);
    autoLoad.ensure();
    expect(autoLoad.state).toBe('waiting');

    store.set(state(false));
    autoLoad.ensure();

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(false);
  });

  it('gives the site its pill back if the load never finishes', () => {
    vi.useFakeTimers();
    stopSite();
    autoLoad.ensure();
    expect(autoLoad.state).toBe('fetching');

    vi.advanceTimersByTime(15_000);

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(false);
  });

  it('stands down when the user leaves the log', () => {
    scrollTo(900);
    autoLoad.ensure();
    history.replaceState(null, '', '/notifications');
    document.dispatchEvent(new CustomEvent('inertia:navigate'));

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
  });

  it('fetches once, however often it is asked', () => {
    const click = vi.fn();

    findNewCommitsPill()?.button.addEventListener('click', click);
    autoLoad.ensure();
    autoLoad.ensure();
    autoLoad.ensure();

    expect(click).toHaveBeenCalledOnce();
  });

  it('does nothing on a page without the pill', () => {
    document.body.innerHTML = logHtml();
    autoLoad.ensure();

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
  });
});
