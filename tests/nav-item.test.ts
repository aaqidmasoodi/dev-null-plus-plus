import { afterEach, describe, expect, it } from 'vitest';

import { OWNED_ATTRIBUTE } from '@/core/constants';
import { observeDom } from '@/core/dom';
import { SETTINGS_HASH } from '@/core/route';
import { NavItem, NAV_ITEM_ROLE, readItemClasses } from '@/features/nav-item/nav-item';

import { ACTIVE_ITEM_CLASS, ITEM_CLASS, LABEL_CLASS, remountNav, renderSite } from './fixtures/site';

const ownItems = (): NodeListOf<Element> => document.querySelectorAll(`[${OWNED_ATTRIBUTE}="${NAV_ITEM_ROLE}"]`);
const label = (element: Element | null | undefined): string | undefined => element?.textContent.trim();
const flushMutations = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const createItem = (): NavItem => new NavItem({ href: SETTINGS_HASH });

describe('NavItem', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('goes directly under Settings', () => {
    const nav = renderSite();
    const item = createItem();

    item.ensure();

    expect(label(item.element?.previousElementSibling)).toBe('Settings');
    expect(item.element?.parentElement).toBe(nav);
    expect(label(item.element)).toBe('/dev/null++');
  });

  it('is a link to the settings page', () => {
    renderSite();
    const item = createItem();

    item.ensure();

    expect(item.element?.getAttribute('href')).toBe(SETTINGS_HASH);
  });

  it('can be pointed elsewhere, before or after it is placed', () => {
    renderSite();
    const item = createItem();

    item.setHref(`/log/latest${SETTINGS_HASH}`);
    item.ensure();
    expect(item.element?.getAttribute('href')).toBe(`/log/latest${SETTINGS_HASH}`);

    item.setHref(SETTINGS_HASH);
    expect(item.element?.getAttribute('href')).toBe(SETTINGS_HASH);
  });

  it('finds Settings by its label when signed out, where every link points to sign-in', () => {
    renderSite({ signedIn: false });
    const item = createItem();

    item.ensure();

    expect(label(item.element?.previousElementSibling)).toBe('Settings');
  });

  it('goes before the first button when there is no Settings link', () => {
    renderSite({ withSettings: false });
    const item = createItem();

    item.ensure();

    expect(label(item.element?.previousElementSibling)).toBe('Starred');
    expect(label(item.element?.nextElementSibling)).toBe('Search');
  });

  it('copies styling from a link that is not the current page', () => {
    renderSite({ current: '/log/latest' });
    const item = createItem();

    item.ensure();

    expect(item.element?.className).toBe(ITEM_CLASS);
    expect(item.element?.querySelector('span > span:last-child')?.className).toBe(LABEL_CLASS);
  });

  it('drops lucide marker classes from the copied icon class', () => {
    const nav = renderSite();
    const classes = readItemClasses(nav.querySelector('a'), null);

    expect(classes.icon).toBe('size-5');
  });

  it('falls back to known classes when the markup changes shape', () => {
    const anchor = document.createElement('a');

    anchor.className = 'some-link';

    const classes = readItemClasses(anchor, null);

    expect(classes.item).toBe('some-link');
    expect(classes.label).toContain('nav-wide:max-w-40');
    expect(classes.icon).toBe('size-5');
    expect(classes.activeItem).toContain('text-primary');
    expect(classes.highlight).toContain('bg-primary-soft');
  });

  it('never reuses a view-transition name from the site', () => {
    const nav = renderSite({ current: '/log/latest' });
    const item = createItem();

    item.ensure();
    item.setActive(true);

    const names = [...nav.querySelectorAll<HTMLElement>('[style], [class*="view-transition-name"]')]
      .flatMap((element) => [
        element.style.getPropertyValue('view-transition-name'),
        /view-transition-name:([\w-]+)/.exec(element.className)?.[1] ?? '',
      ])
      .filter((name) => name !== '');

    expect(names).toContain('nav-dev-null-plus-plus');
    expect(new Set(names).size).toBe(names.length);
  });

  describe('active state', () => {
    it('looks like the site’s current-page link while active', () => {
      renderSite({ current: '/log/latest' });
      const item = createItem();

      item.ensure();
      item.setActive(true);

      expect(item.element?.className).toBe(ACTIVE_ITEM_CLASS);
      expect(item.element?.getAttribute('aria-current')).toBe('page');
      expect(item.element?.querySelector(':scope > span[aria-hidden]')?.className).toContain('bg-primary-soft');
    });

    it('falls back to the known active look when no link is current', () => {
      renderSite();
      const item = createItem();

      item.ensure();
      item.setActive(true);

      expect(item.element?.className).toContain('text-primary');
      expect(item.element?.querySelector(':scope > span[aria-hidden]')).not.toBeNull();
    });

    it('goes back to normal when inactive', () => {
      renderSite({ current: '/log/latest' });
      const item = createItem();

      item.ensure();
      item.setActive(true);
      item.setActive(false);

      expect(item.element?.className).toBe(ITEM_CLASS);
      expect(item.element?.hasAttribute('aria-current')).toBe(false);
      expect(item.element?.querySelector(':scope > span[aria-hidden]')).toBeNull();
    });

    it('survives the nav being rebuilt', () => {
      renderSite();
      const item = createItem();

      item.ensure();
      item.setActive(true);
      remountNav();
      item.ensure();

      expect(item.element?.getAttribute('aria-current')).toBe('page');
    });
  });

  it('is idempotent', () => {
    renderSite();
    const item = createItem();

    item.ensure();
    const first = item.element;
    item.ensure();
    item.ensure();

    expect(ownItems()).toHaveLength(1);
    expect(item.element).toBe(first);
  });

  it('comes back when React remounts the nav', async () => {
    renderSite();
    const item = createItem();
    const controller = new AbortController();

    item.ensure();
    observeDom(() => {
      item.ensure();
    }, controller.signal);

    const nav = remountNav();

    await flushMutations();

    expect(ownItems()).toHaveLength(1);
    expect(item.element?.parentElement).toBe(nav);
    expect(label(item.element?.previousElementSibling)).toBe('Settings');
    controller.abort();
  });

  it('moves back under Settings if something lands between them', () => {
    const nav = renderSite();
    const item = createItem();

    item.ensure();
    nav.querySelector('a[href="/settings/profile"]')?.after(document.createElement('a'));
    item.ensure();

    expect(label(item.element?.previousElementSibling)).toBe('Settings');
  });

  it('removes items left by an earlier copy of the extension', () => {
    renderSite();
    const stale = createItem();

    stale.ensure();

    const fresh = createItem();

    fresh.ensure();

    expect(ownItems()).toHaveLength(1);
    expect(ownItems()[0]).toBe(fresh.element);
  });

  it('does nothing on pages without the rail', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const item = createItem();

    expect(() => {
      item.ensure();
    }).not.toThrow();
    expect(item.element).toBeNull();
  });

  it('cleans up after itself', () => {
    renderSite();
    const item = createItem();

    item.ensure();
    item.destroy();

    expect(ownItems()).toHaveLength(0);
  });
});
