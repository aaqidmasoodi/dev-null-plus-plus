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

/**
 * Where a link to the settings page should point from the current page.
 *
 * @param elsewhere A same-origin path to open it on instead, when the current page cannot host it. `null` opens it in
 * place, on the current page.
 */
export function settingsHref(elsewhere: string | null): string {
  return elsewhere === null ? SETTINGS_HASH : `${elsewhere}${SETTINGS_HASH}`;
}

/**
 * Opens the settings page. In place it only moves to the fragment, which adds a history entry so Back closes it again.
 * Elsewhere it is an ordinary page load.
 */
export function openSettingsRoute(elsewhere: string | null): void {
  if (elsewhere !== null) {
    location.assign(settingsHref(elsewhere));

    return;
  }

  if (!isSettingsRoute()) {
    location.hash = SETTINGS_HASH;
  }
}

/**
 * Moves an open settings page from a page that cannot host it to `path`, keeping any sub-page. It replaces the
 * current history entry, so Back does not land on the page that bounced it.
 */
export function moveSettingsRoute(path: string): void {
  location.replace(`${path}${location.hash}`);
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
