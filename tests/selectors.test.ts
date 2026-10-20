import { afterEach, describe, expect, it } from 'vitest';

import { findHomePath, findLinkTemplate, isFullScreenLayout } from '@/site/selectors';

import { renderSite } from './fixtures/site';

describe('isFullScreenLayout', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-fixed-page');
    document.body.innerHTML = '';
  });

  it('is false on the standard three-column layout', () => {
    renderSite();

    expect(isFullScreenLayout()).toBe(false);
  });

  it('is true on Remotes’ full-screen layout', () => {
    renderSite({ layout: 'full-screen' });

    expect(isFullScreenLayout()).toBe(true);
  });

  it('needs both signs, so a page still rendering its right column does not count', () => {
    renderSite();
    document.querySelector('aside')?.remove();

    expect(isFullScreenLayout()).toBe(false);
  });

  it('is false where there is no middle column at all', () => {
    document.body.innerHTML = '<div id="app"></div>';
    document.documentElement.setAttribute('data-fixed-page', '');

    expect(isFullScreenLayout()).toBe(false);
  });
});

describe('findHomePath', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is the log the Log link points to', () => {
    renderSite();

    expect(findHomePath()).toBe('/log/latest');
  });

  it('falls back to the latest log when the Log link is not a log, as for guests', () => {
    renderSite();
    document.querySelector('nav a')?.setAttribute('href', '/');

    expect(findHomePath()).toBe('/log/latest');
  });

  it('never points off the site', () => {
    renderSite();
    document.querySelector('nav a')?.setAttribute('href', 'https://evil.example/log/latest');

    expect(findHomePath()).toBe('/log/latest');
  });

  it('falls back when there is no nav', () => {
    document.body.innerHTML = '<div id="app"></div>';

    expect(findHomePath()).toBe('/log/latest');
  });
});

describe('nav links', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('never use our own item as a template', () => {
    const nav = renderSite();
    const ours = document.createElement('a');

    ours.setAttribute('data-dnpp', 'nav-item');
    nav.prepend(ours);

    expect(findLinkTemplate(nav)).not.toBe(ours);
    expect(findHomePath()).toBe('/log/latest');
  });
});
