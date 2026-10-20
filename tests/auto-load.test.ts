import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExtensionState } from '@/core/extension-state';
import { SettingsStore } from '@/core/settings';
import { AutoLoadNewCommits, COVERED_ATTRIBUTE, NOTICE_MS } from '@/features/auto-load/auto-load';
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
  let click: ReturnType<typeof vi.fn<(event: Event) => void>>;

  /** Lets the pill have its moment and our pill settle into "Fetching…", by which point the site's has been pressed. */
  const afterNoticing = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(NOTICE_MS + 400);
  };

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    history.replaceState(null, '', '/log/latest');
    document.body.innerHTML = logHtml({ count: 2 });
    scrollTo(0);
    store = new SettingsStore(state());
    controller = new AbortController();
    autoLoad = new AutoLoadNewCommits({ store, signal: controller.signal });
    stopSite = respondToPillLikeTheSite(['c5', 'c4']);
    click = vi.fn<(event: Event) => void>();
    findNewCommitsPill()?.button.addEventListener('click', click);
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

  it('lets the site’s pill show on its own for a moment first', async () => {
    autoLoad.ensure();

    expect(autoLoad.state).toBe('noticed');
    expect(ours()).toBeNull();
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(false);

    await vi.advanceTimersByTimeAsync(NOTICE_MS - 100);

    expect(click).not.toHaveBeenCalled();
    expect(ours()).toBeNull();
  });

  it('then swaps in a pill that looks just like it, and only then turns to "Fetching…" and presses it', async () => {
    autoLoad.ensure();
    await vi.advanceTimersByTimeAsync(NOTICE_MS + 50);

    expect(autoLoad.state).toBe('fetching');
    expect(ourText()).toBe('2 new commits');
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(true);
    expect(click).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(350);

    expect(ourText()).toBe('Fetching 2 new commits…');
    expect(click).toHaveBeenCalledOnce();
  });

  it('keeps "Fetching…" up for a moment even when the load is instant, then shows what arrived', async () => {
    autoLoad.ensure();
    await afterNoticing();

    // The site answered at once, but the reader still gets to see it fetching.
    expect(ourText()).toBe('Fetching 2 new commits…');

    await vi.advanceTimersByTimeAsync(1_300);

    expect(feedCommits().map((row) => row.dataset.commit)).toEqual(['c5', 'c4', 'c3', 'c2', 'c1']);
    expect(ourText()).toBe('2 new commits loaded');
  });

  it('goes back to idle once the pill has faded, leaving the new commits tinted', async () => {
    autoLoad.ensure();
    await afterNoticing();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
    expect(document.querySelector<HTMLElement>('[data-commit="c5"]')?.getAnimations().length).toBeGreaterThan(0);
  });

  it('leaves a pill alone if it goes away during its moment', async () => {
    autoLoad.ensure();
    sitePillWrapper()?.remove();
    await vi.advanceTimersByTimeAsync(NOTICE_MS + 400);

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
  });

  it('keeps going when the site’s own reload reports a navigation on the log', async () => {
    autoLoad.ensure();
    await afterNoticing();

    expect(autoLoad.state).not.toBe('idle');
  });

  it('does not reload or move the page when the reader is scrolled down', async () => {
    const scroll = vi.spyOn(window, 'scrollTo');

    scrollTo(900);
    autoLoad.ensure();
    await afterNoticing();

    expect(click).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
    expect(autoLoad.state).toBe('waiting');
    expect(ourText()).toBe('2 new commits above');
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(true);
  });

  it('loads them once the reader is back at the top', async () => {
    scrollTo(900);
    autoLoad.ensure();
    await afterNoticing();
    scrollTo(40);
    autoLoad.ensure();
    await vi.advanceTimersByTimeAsync(400);

    expect(click).toHaveBeenCalledOnce();
    // The stand-in site answers at once, so it may already be showing what arrived.
    expect(['fetching', 'settling']).toContain(autoLoad.state);
  });

  it('scrolls to the top when our waiting pill is clicked', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    scrollTo(900);
    autoLoad.ensure();
    await afterNoticing();
    ours()?.shadowRoot?.querySelector<HTMLButtonElement>('.pill')?.click();

    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('keeps the count up to date while waiting', async () => {
    scrollTo(900);
    autoLoad.ensure();
    await afterNoticing();
    findNewCommitsPill()?.button.lastChild?.replaceWith('5 new commits');
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
  ])('keeps its hands off while %s', async (_, arrange) => {
    arrange();
    autoLoad.ensure();
    await afterNoticing();

    expect(click).not.toHaveBeenCalled();
    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(false);
  });

  it('stops if the reader starts a reply during the pill’s moment', async () => {
    autoLoad.ensure();
    document.body.insertAdjacentHTML('beforeend', '<form data-test="reply-composer"></form>');
    await afterNoticing();

    expect(click).not.toHaveBeenCalled();
    expect(autoLoad.state).toBe('idle');
  });

  it('waits for the tab to be in view', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    autoLoad.ensure();
    await afterNoticing();

    expect(click).not.toHaveBeenCalled();
  });

  it('does nothing when switched off, and gives the site its pill back if it was waiting', async () => {
    scrollTo(900);
    autoLoad.ensure();
    await afterNoticing();
    expect(autoLoad.state).toBe('waiting');

    store.set(state(false));
    autoLoad.ensure();

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(false);
  });

  it('gives the site its pill back if the load never finishes', async () => {
    stopSite();
    autoLoad.ensure();
    await afterNoticing();
    expect(autoLoad.state).toBe('fetching');

    await vi.advanceTimersByTimeAsync(15_000);

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
    expect(sitePillWrapper()?.hasAttribute(COVERED_ATTRIBUTE)).toBe(false);
  });

  it('stands down when the user leaves the log', async () => {
    scrollTo(900);
    autoLoad.ensure();
    await afterNoticing();
    history.replaceState(null, '', '/notifications');
    document.dispatchEvent(new CustomEvent('inertia:navigate'));

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
  });

  it('fetches once, however often it is asked', async () => {
    for (let i = 0; i < 5; i++) {
      autoLoad.ensure();
      await vi.advanceTimersByTimeAsync(300);
    }

    await afterNoticing();

    expect(click).toHaveBeenCalledOnce();
  });

  it('does nothing on a page without the pill', async () => {
    document.body.innerHTML = logHtml();
    autoLoad.ensure();
    await afterNoticing();

    expect(autoLoad.state).toBe('idle');
    expect(ours()).toBeNull();
  });
});
