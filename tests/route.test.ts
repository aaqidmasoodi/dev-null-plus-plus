import { afterEach, describe, expect, it, vi } from 'vitest';

import { isSettingsRoute, onRouteChange, openSettingsRoute, SETTINGS_HASH, settingsHref } from '@/core/route';

describe('settings route', () => {
  afterEach(() => {
    history.replaceState(null, '', '/');
  });

  it('matches its fragment and sub-pages under it, nothing else', () => {
    expect(isSettingsRoute('#dev-null-plus-plus')).toBe(true);
    expect(isSettingsRoute('#dev-null-plus-plus/ai')).toBe(true);
    expect(isSettingsRoute('')).toBe(false);
    expect(isSettingsRoute('#dev-null-plus-plus-other')).toBe(false);
    expect(isSettingsRoute('#comments')).toBe(false);
  });

  it('opens by moving to its fragment on the current page', () => {
    history.replaceState(null, '', '/log/latest');

    openSettingsRoute(null);

    expect(location.pathname).toBe('/log/latest');
    expect(location.hash).toBe(SETTINGS_HASH);
  });

  it('leaves the URL alone when already open on a sub-page', () => {
    history.replaceState(null, '', `/log/latest${SETTINGS_HASH}/ai`);

    openSettingsRoute(null);

    expect(location.hash).toBe(`${SETTINGS_HASH}/ai`);
  });

  it('links in place, or to another page when this one cannot host it', () => {
    expect(settingsHref(null)).toBe(SETTINGS_HASH);
    expect(settingsHref('/log/latest')).toBe(`/log/latest${SETTINGS_HASH}`);
  });

  it('reports fragment changes, Back and Forward, and Inertia visits until aborted', () => {
    const callback = vi.fn();
    const controller = new AbortController();

    onRouteChange(callback, controller.signal);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    window.dispatchEvent(new PopStateEvent('popstate'));
    document.dispatchEvent(new CustomEvent('inertia:navigate'));

    expect(callback).toHaveBeenCalledTimes(3);

    controller.abort();
    document.dispatchEvent(new CustomEvent('inertia:navigate'));

    expect(callback).toHaveBeenCalledTimes(3);
  });
});
