import { isSettingsRoute, openSettingsRoute, SETTINGS_HASH } from '@/core/route';
import { followSiteLink } from '@/site/navigate';
import { findHomeLink, isFullScreenLayout } from '@/site/selectors';

/** How long to wait for the site to arrive before giving up on opening the settings page there. */
const ARRIVAL_TIMEOUT_MS = 15_000;

interface Pending {
  from: string;
  deadline: number;
}

/**
 * Whether the visit has landed. Any log counts, not just the Log link's path: the site redirects the Log link to the
 * log you last looked at, so `/log/latest` can land on `/log/following`.
 */
function isLog(path: string): boolean {
  return path.startsWith('/log/');
}

/**
 * Opens the settings page on another page, for pages that cannot host it, as smoothly as the site's own navigation.
 *
 * Rather than loading the log page, which reloads the whole app and shifts the layout, it follows the site's own Log
 * link, so Inertia swaps the page in place with the site's transitions. Once the log has rendered, {@link settle} adds
 * the settings fragment to the URL in the same frame, before anything is painted, so the log never flashes up.
 */
export class SettingsNavigator {
  #pending: Pending | null = null;

  get isPending(): boolean {
    return this.#pending !== null;
  }

  /** Opens the settings page on `path`, which must be the path of the site's Log link. */
  openOn(path: string): void {
    const link = findHomeLink();
    // Read before following the link: a router may change the URL straight away, before it returns.
    const from = location.pathname;

    if (link !== null && new URL(link.href, location.href).pathname === path && followSiteLink(link)) {
      this.#pending = { from, deadline: performance.now() + ARRIVAL_TIMEOUT_MS };

      return;
    }

    // The site did not take it, so fall back to an ordinary page load. Slower, but it still gets there.
    openSettingsRoute(path);
  }

  /**
   * Finishes a pending open once the site has arrived and rendered its standard layout. Call it at the start of every
   * sync, which runs on every DOM change, so it catches the first render of the new page.
   */
  settle(): void {
    const pending = this.#pending;

    if (pending === null) {
      return;
    }

    const path = location.pathname;

    if (performance.now() > pending.deadline || (path !== pending.from && !isLog(path))) {
      // Too slow, or the user went somewhere else meanwhile. Leave them where they are.
      this.#pending = null;

      return;
    }

    if (path === pending.from || isFullScreenLayout()) {
      // Still on the way: the URL has not changed yet, or the log has not rendered yet.
      return;
    }

    this.#pending = null;

    if (!isSettingsRoute()) {
      // Replace rather than push: the visit already added the entry, so Back returns to where they came from. Inertia's
      // state is kept as it is, and it keeps the fragment on the URL through its own later visits.
      history.replaceState(history.state, '', `${location.pathname}${location.search}${SETTINGS_HASH}`);
    }
  }
}
