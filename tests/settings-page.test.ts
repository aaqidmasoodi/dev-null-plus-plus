import { afterEach, describe, expect, it } from 'vitest';

import { OWNED_ATTRIBUTE } from '@/core/constants';
import { aboutSection } from '@/features/settings-page/sections';
import { SETTINGS_PAGE_ROLE, SETTINGS_TITLE, SettingsPage } from '@/features/settings-page/settings-page';
import { removeTakeover, VIEW_ATTRIBUTE } from '@/site/takeover';

import { renderSite } from './fixtures/site';

const hosts = (): NodeListOf<Element> => document.querySelectorAll(`[${OWNED_ATTRIBUTE}="${SETTINGS_PAGE_ROLE}"]`);
const pages: SettingsPage[] = [];
const createPage = (): SettingsPage => {
  const page = new SettingsPage({ sections: [aboutSection('1.2.3', () => undefined)] });

  pages.push(page);

  return page;
};
const main = (): HTMLElement | null => document.querySelector('main[data-main]');

describe('SettingsPage', () => {
  afterEach(() => {
    // An open page keeps watching the title, so every test's pages must close or they interfere with the next test.
    pages.splice(0).forEach((page) => {
      page.destroy();
    });
    removeTakeover();
    document.body.innerHTML = '';
    document.title = '';
  });

  it('shows in the middle column in place of the site’s page', () => {
    renderSite();
    const page = createPage();

    page.setOpen(true);

    expect(page.host.parentElement).toBe(main());
    expect(document.documentElement.getAttribute(VIEW_ATTRIBUTE)).toBe(SETTINGS_PAGE_ROLE);
    expect(document.head.querySelector(`style[${OWNED_ATTRIBUTE}]`)?.textContent).toContain('display: none');
  });

  it('gives the site its page back when closed', () => {
    renderSite();
    const page = createPage();

    page.setOpen(true);
    page.setOpen(false);

    expect(hosts()).toHaveLength(0);
    expect(document.documentElement.hasAttribute(VIEW_ATTRIBUTE)).toBe(false);
  });

  it('renders the wordmark title and the about section', () => {
    renderSite();
    const page = createPage();
    const shadow = page.host.shadowRoot;

    expect(shadow?.querySelector('h1')?.textContent).toBe('/dev/null++');
    expect(shadow?.querySelector('h2')?.textContent).toBe('About');
    expect(shadow?.querySelector('dl')?.textContent).toContain('Installed and running');
    expect(shadow?.querySelector('dl')?.textContent).toContain('v1.2.3');
  });

  it('sets the tab title while open and restores it after', () => {
    renderSite();
    document.title = 'Latest - /dev/null';
    const page = createPage();

    page.setOpen(true);
    expect(document.title).toBe(SETTINGS_TITLE);

    page.setOpen(false);
    expect(document.title).toBe('Latest - /dev/null');
  });

  it('keeps its title when the site re-renders its own, and gives back the latest one', async () => {
    renderSite();
    document.title = 'Latest - /dev/null';
    const page = createPage();

    page.setOpen(true);
    document.title = 'Trending - /dev/null';
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.title).toBe(SETTINGS_TITLE);

    page.setOpen(false);
    expect(document.title).toBe('Trending - /dev/null');
  });

  it('leaves the title alone if the site set a new one just as it closed', () => {
    renderSite();
    document.title = 'Latest - /dev/null';
    const page = createPage();

    page.setOpen(true);
    document.title = 'Trending - /dev/null';
    page.setOpen(false);

    expect(document.title).toBe('Trending - /dev/null');
  });

  it('moves into a new column when React replaces it', () => {
    renderSite();
    const page = createPage();

    page.setOpen(true);

    const oldMain = main();
    const newMain = document.createElement('main');

    newMain.setAttribute('data-main', '');
    oldMain?.replaceWith(newMain);
    page.ensure();

    expect(page.host.parentElement).toBe(newMain);
  });

  it('waits for the column when there is none yet', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const page = createPage();

    page.setOpen(true);
    expect(page.host.isConnected).toBe(false);

    renderSite();
    page.ensure();
    expect(page.host.parentElement).toBe(main());
  });

  it('replaces a page left by an earlier copy of the extension', () => {
    renderSite();
    createPage().setOpen(true);

    const fresh = createPage();

    fresh.setOpen(true);

    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).toBe(fresh.host);
  });
});
