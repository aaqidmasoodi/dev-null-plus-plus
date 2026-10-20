import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SETTINGS_HASH } from '@/core/route';
import { SettingsNavigator } from '@/features/settings-page/navigator';
import { followSiteLink, isPlainClick } from '@/site/navigate';

import { renderSite } from './fixtures/site';

/**
 * Stands in for Inertia: takes clicks on the nav's links, pushes the new URL and renders the standard layout, the way a
 * visit from Remotes to the log does.
 */
function routeLikeInertia(): () => void {
  const app = document.getElementById('app');
  const onClick = (event: Event): void => {
    const link = (event.target as Element).closest('a');

    if (link === null) {
      return;
    }

    event.preventDefault();
    history.pushState({ page: { component: 'log/show' } }, '', link.getAttribute('href'));
  };

  app?.addEventListener('click', onClick);

  return () => app?.removeEventListener('click', onClick);
}

const homeLink = (): HTMLAnchorElement => {
  const link = document.querySelector<HTMLAnchorElement>('nav[aria-label="Main"] > a');

  if (link === null) {
    throw new Error('No Log link.');
  }

  return link;
};

describe('followSiteLink', () => {
  beforeEach(() => {
    renderSite();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reports when the site took the navigation', () => {
    const stop = routeLikeInertia();

    expect(followSiteLink(homeLink())).toBe(true);
    stop();
  });

  it('reports when nothing took it, and stops the browser following it as a plain link', () => {
    let followed = true;
    const spy = (event: Event): void => {
      queueMicrotask(() => {
        followed = !event.defaultPrevented;
      });
    };

    document.addEventListener('click', spy);
    expect(followSiteLink(homeLink())).toBe(false);
    document.removeEventListener('click', spy);

    return Promise.resolve().then(() => {
      expect(followed).toBe(false);
    });
  });
});

describe('isPlainClick', () => {
  it('is a left click with no modifier keys', () => {
    expect(isPlainClick(new MouseEvent('click', { button: 0 }))).toBe(true);
    expect(isPlainClick(new MouseEvent('click', { button: 1 }))).toBe(false);
    expect(isPlainClick(new MouseEvent('click', { button: 0, ctrlKey: true }))).toBe(false);
    expect(isPlainClick(new MouseEvent('click', { button: 0, metaKey: true }))).toBe(false);
    expect(isPlainClick(new MouseEvent('click', { button: 0, shiftKey: true }))).toBe(false);
  });
});

describe('SettingsNavigator', () => {
  let stopRouting: () => void;

  beforeEach(() => {
    history.replaceState(null, '', '/remotes');
    renderSite({ layout: 'full-screen' });
    stopRouting = routeLikeInertia();
  });

  afterEach(() => {
    stopRouting();
    document.documentElement.removeAttribute('data-fixed-page');
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
  });

  it('goes through the site’s router, then opens the settings page once the log has rendered', () => {
    const navigator = new SettingsNavigator();

    navigator.openOn('/log/latest');
    expect(location.pathname).toBe('/log/latest');
    expect(navigator.isPending).toBe(true);

    // The URL has changed but the log has not rendered yet: still the full-screen layout.
    navigator.settle();
    expect(location.hash).toBe('');

    renderSite({ layout: 'standard' });
    navigator.settle();

    expect(location.pathname).toBe('/log/latest');
    expect(location.hash).toBe(SETTINGS_HASH);
    expect(navigator.isPending).toBe(false);
  });

  it('adds the fragment with a fragment navigation, which the site’s router hears, not a silent history write', () => {
    // With history.replaceState Inertia never learns of the fragment, and drops it on its next history write.
    // `location.replace` also adds no history entry in real browsers, so Back returns to where they came from. Checked
    // on the live site; happy-dom gets that part wrong, so it is not asserted here.
    const navigator = new SettingsNavigator();
    const replaceState = vi.spyOn(history, 'replaceState');
    const replaced: string[] = [];
    const original = Object.getOwnPropertyDescriptor(Location.prototype, 'replace');

    navigator.openOn('/log/latest');
    renderSite({ layout: 'standard' });
    Object.defineProperty(Location.prototype, 'replace', {
      configurable: true,
      value: (url: string) => {
        replaced.push(url);
      },
    });

    try {
      navigator.settle();
    } finally {
      if (original !== undefined) {
        Object.defineProperty(Location.prototype, 'replace', original);
      }
    }

    expect(replaced).toEqual([`/log/latest${SETTINGS_HASH}`]);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('opens on whichever log the site redirects to', () => {
    // The site sends the Log link to the log you last looked at.
    const navigator = new SettingsNavigator();

    navigator.openOn('/log/latest');
    history.replaceState(history.state, '', '/log/following');
    renderSite({ layout: 'standard' });
    navigator.settle();

    expect(location.pathname).toBe('/log/following');
    expect(location.hash).toBe(SETTINGS_HASH);
  });

  it('gives up if the user goes somewhere else meanwhile', () => {
    const navigator = new SettingsNavigator();

    navigator.openOn('/log/latest');
    history.pushState(null, '', '/notifications');
    renderSite({ layout: 'standard' });
    navigator.settle();

    expect(navigator.isPending).toBe(false);
    expect(location.hash).toBe('');
  });

  it('only follows the Log link to its own path', () => {
    const navigator = new SettingsNavigator();
    let assigned: string | null = null;
    const original = Object.getOwnPropertyDescriptor(Location.prototype, 'assign');

    Object.defineProperty(Location.prototype, 'assign', {
      configurable: true,
      value: (url: string) => {
        assigned = url;
      },
    });

    try {
      navigator.openOn('/log/following');
    } finally {
      if (original !== undefined) {
        Object.defineProperty(Location.prototype, 'assign', original);
      }
    }

    expect(navigator.isPending).toBe(false);
    expect(assigned).toBe(`/log/following${SETTINGS_HASH}`);
  });
});
