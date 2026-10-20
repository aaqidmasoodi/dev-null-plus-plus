/**
 * The extension's own pages live behind a URL fragment on whatever dev-null.sh page you are on, for example
 * `https://dev-null.sh/log/latest#dev-null-plus-plus`.
 *
 * A fragment, not a path, because:
 * - Fragments never reach the server, so reloading or sharing the URL cannot 404.
 * - Inertia polls with `router.reload()`, which requests `window.location.href`. A made-up path would make that poll
 *   fail and the site would show its "page deleted" dialog. With a fragment it requests the real page, and Inertia
 *   copies the fragment back onto the URL (`setHashIfSameUrl`).
 * - Inertia treats a fragment change as an anchor jump and leaves the page alone, so Back simply closes our page.
 *
 * Sub-pages, when there are some, extend it: `#dev-null-plus-plus/<tab>`.
 */
export const SETTINGS_HASH = '#dev-null-plus-plus';

export function isSettingsRoute(hash: string = location.hash): boolean {
  return hash === SETTINGS_HASH || hash.startsWith(`${SETTINGS_HASH}/`);
}

/** Opens the settings page by moving to its fragment, which adds a history entry so Back closes it again. */
export function openSettingsRoute(): void {
  if (!isSettingsRoute()) {
    location.hash = SETTINGS_HASH;
  }
}

/**
 * Calls `callback` whenever the URL may have changed, until `signal` aborts.
 *
 * Fragment changes fire `hashchange`, Back and Forward fire `popstate`, and Inertia's own visits use `pushState`, which
 * fires neither, so we also listen for the `inertia:navigate` event Inertia dispatches on the document after every visit.
 */
export function onRouteChange(callback: () => void, signal: AbortSignal): void {
  window.addEventListener('hashchange', callback, { signal });
  window.addEventListener('popstate', callback, { signal });
  document.addEventListener('inertia:navigate', callback, { signal });
}
