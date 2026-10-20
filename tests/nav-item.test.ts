import { afterEach, describe, expect, it, vi } from 'vitest';

import { OWNED_ATTRIBUTE } from '@/core/constants';
import { observeDom } from '@/core/dom';
import { NavItem, NAV_ITEM_ROLE, readItemClasses } from '@/features/nav-item/nav-item';

import { ACTIVE_ITEM_CLASS, ITEM_CLASS, LABEL_CLASS, remountNav, renderSite } from './fixtures/site';

const ownItems = (): NodeListOf<Element> => document.querySelectorAll(`[${OWNED_ATTRIBUTE}="${NAV_ITEM_ROLE}"]`);
const label = (element: Element | null | undefined): string | undefined => element?.textContent.trim();
const flushMutations = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('NavItem', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('goes directly under Settings', () => {
    const nav = renderSite();
    const item = new NavItem({ onActivate: vi.fn() });

    item.ensure();

    expect(label(item.element?.previousElementSibling)).toBe('Settings');
    expect(item.element?.parentElement).toBe(nav);
    expect(label(item.element)).toBe('/dev/null++');
  });

  it('finds Settings by its label when signed out, where every link points to sign-in', () => {
    renderSite({ signedIn: false });
    const item = new NavItem({ onActivate: vi.fn() });

    item.ensure();

    expect(label(item.element?.previousElementSibling)).toBe('Settings');
  });

  it('goes before the first button when there is no Settings link', () => {
    renderSite({ withSettings: false });
    const item = new NavItem({ onActivate: vi.fn() });

    item.ensure();

    expect(label(item.element?.previousElementSibling)).toBe('Starred');
    expect(label(item.element?.nextElementSibling)).toBe('Search');
  });

  it('copies styling from a link that is not the current page', () => {
    renderSite({ current: '/log/latest' });
    const item = new NavItem({ onActivate: vi.fn() });

    item.ensure();

    expect(item.element?.className).toBe(ITEM_CLASS);
    expect(item.element?.className).not.toBe(ACTIVE_ITEM_CLASS);
    expect(item.element?.querySelector('span > span:last-child')?.className).toBe(LABEL_CLASS);
  });

  it('drops lucide marker classes from the copied icon class', () => {
    const nav = renderSite();
    const classes = readItemClasses(nav.querySelector('a'));

    expect(classes.icon).toBe('size-5');
  });

  it('falls back to known classes when the markup changes shape', () => {
    const anchor = document.createElement('a');

    anchor.className = 'some-link';

    const classes = readItemClasses(anchor);

    expect(classes.item).toBe('some-link');
    expect(classes.label).toContain('nav-wide:max-w-40');
    expect(classes.icon).toBe('size-5');
  });

  it('never reuses a view-transition name from the site', () => {
    const nav = renderSite();
    const item = new NavItem({ onActivate: vi.fn() });

    item.ensure();

    const names = [...nav.querySelectorAll<HTMLElement>('[style]')]
      .map((element) => element.style.getPropertyValue('view-transition-name'))
      .filter((name) => name !== '');

    expect(names).toContain('nav-dev-null-plus-plus');
    expect(new Set(names).size).toBe(names.length);
  });

  it('is idempotent', () => {
    renderSite();
    const item = new NavItem({ onActivate: vi.fn() });

    item.ensure();
    const first = item.element;
    item.ensure();
    item.ensure();

    expect(ownItems()).toHaveLength(1);
    expect(item.element).toBe(first);
  });

  it('comes back when React remounts the nav', async () => {
    renderSite();
    const item = new NavItem({ onActivate: vi.fn() });
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
    const item = new NavItem({ onActivate: vi.fn() });

    item.ensure();
    nav.querySelector('a[href="/settings/profile"]')?.after(document.createElement('a'));
    item.ensure();

    expect(label(item.element?.previousElementSibling)).toBe('Settings');
  });

  it('removes items left by an earlier copy of the extension', () => {
    renderSite();
    const stale = new NavItem({ onActivate: vi.fn() });

    stale.ensure();

    const fresh = new NavItem({ onActivate: vi.fn() });

    fresh.ensure();

    expect(ownItems()).toHaveLength(1);
    expect(ownItems()[0]).toBe(fresh.element);
  });

  it('calls onActivate on click', () => {
    renderSite();
    const onActivate = vi.fn();
    const item = new NavItem({ onActivate });

    item.ensure();
    item.element?.click();

    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('reflects whether the panel is open', () => {
    renderSite();
    const item = new NavItem({ onActivate: vi.fn() });

    item.ensure();
    expect(item.element?.getAttribute('aria-expanded')).toBe('false');

    item.setExpanded(true);
    expect(item.element?.getAttribute('aria-expanded')).toBe('true');

    // A rebuilt item keeps the state.
    remountNav();
    item.ensure();
    expect(item.element?.getAttribute('aria-expanded')).toBe('true');
  });

  it('does nothing on pages without the rail', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const item = new NavItem({ onActivate: vi.fn() });

    expect(() => {
      item.ensure();
    }).not.toThrow();
    expect(item.element).toBeNull();
  });

  it('cleans up after itself', () => {
    renderSite();
    const item = new NavItem({ onActivate: vi.fn() });

    item.ensure();
    item.destroy();

    expect(ownItems()).toHaveLength(0);
  });
});
