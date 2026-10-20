/**
 * Every assumption the extension makes about dev-null.sh's markup lives in this file.
 *
 * dev-null.sh deploys many times a day, and its class names are generated Tailwind, so nothing here selects on classes.
 * We only rely on structural attributes the site uses for its own layout and tests (`data-nav-rail`, `aria-label`,
 * `aria-current`, `data-test`), cross-checked against the public source at
 * https://github.com/nunomaduro/dev-null.sh (resources/js/components/app-nav.tsx).
 *
 * When the site changes and something stops working, this file and the e2e suite are the places to look first.
 */

import { OWNED_ATTRIBUTE } from '@/core/constants';

export const SELECTORS = {
  /** The React root the server-rendered page hydrates into. */
  appRoot: '#app',
  /** The desktop and tablet left rail. Hidden below the `md` breakpoint, where the site shows a bottom bar instead. */
  navRail: '[data-nav-rail]',
  /** The list of links and buttons inside the rail. */
  mainNav: '[data-nav-rail] nav[aria-label="Main"]',
  /** The middle column. Our pages render in here. */
  main: 'main[data-main]',
  /** The site's content inside the middle column: the mobile header and the current page. Hidden while ours shows. */
  mainContent: 'main[data-main] > [data-nav-content]',
} as const;

/** Set on `<html>` by the site's `useFixedPage` hook on pages that fill the screen. */
const FIXED_PAGE_ATTRIBUTE = 'data-fixed-page';

/** Attributes on `<html>` that change the layout, so the extension can re-check when they do. */
export const LAYOUT_ATTRIBUTES = [FIXED_PAGE_ATTRIBUTE] as const;

/** Signed in, Settings links to `/settings/profile`. Signed out, every item links to the sign-in page instead. */
const SETTINGS_PATH_PREFIX = '/settings';
const SETTINGS_LABEL = 'Settings';

export function findMainNav(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(SELECTORS.mainNav);
}

/** The site's own links in the nav, leaving out ours. */
function navLinks(nav: HTMLElement): HTMLAnchorElement[] {
  return [...nav.children].filter(
    (child): child is HTMLAnchorElement => child instanceof HTMLAnchorElement && !child.hasAttribute(OWNED_ATTRIBUTE),
  );
}

/**
 * The Settings link, which our item goes right after. Matched by its path when signed in and by its label when signed
 * out, since guests' links all point to sign-in.
 */
export function findSettingsLink(nav: HTMLElement): HTMLAnchorElement | null {
  const links = navLinks(nav);

  return (
    links.find((link) => new URL(link.href, location.href).pathname.startsWith(SETTINGS_PATH_PREFIX)) ??
    links.find((link) => link.textContent.trim() === SETTINGS_LABEL) ??
    null
  );
}

/**
 * A nav link to copy styling from. It has to be one that is not the current page, since the current page's link
 * carries extra classes and a highlight element.
 */
export function findLinkTemplate(nav: HTMLElement): HTMLAnchorElement | null {
  const links = navLinks(nav);

  return links.find((link) => !link.hasAttribute('aria-current')) ?? links[0] ?? null;
}

/** The site's link for the current page, if there is one, to copy the active styling from. */
export function findActiveLink(nav: HTMLElement): HTMLAnchorElement | null {
  return navLinks(nav).find((link) => link.getAttribute('aria-current') === 'page') ?? null;
}

export function findMain(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(SELECTORS.main);
}

/** Where the Log link falls back to if the nav cannot tell us. */
const DEFAULT_HOME_PATH = '/log/latest';

/**
 * The path of the user's log, from the site's Log link (the first in the nav), so it is the log they chose. Guests'
 * Log link points at the landing page, so anything that is not a log falls back to the latest log.
 */
export function findHomePath(root: ParentNode = document): string {
  const nav = findMainNav(root);
  const link = nav === null ? undefined : navLinks(nav)[0];

  if (link === undefined) {
    return DEFAULT_HOME_PATH;
  }

  const url = new URL(link.href, location.href);

  return url.origin === location.origin && url.pathname.startsWith('/log/') ? url.pathname : DEFAULT_HOME_PATH;
}

/**
 * Whether the current page uses the site's full-screen layout, which Remotes (direct messages) do: no right column, a
 * wider middle column, and a page that does not scroll. Our pages need the standard three-column layout, so on these
 * pages they open on the log instead.
 *
 * Both signs must be present. The site sets `data-fixed-page` on `<html>` only after the page has rendered, which
 * avoids a false reading while a page is still loading and its right column is not in the DOM yet.
 */
export function isFullScreenLayout(root: Document = document): boolean {
  const main = findMain(root);

  return (
    main !== null &&
    root.documentElement.hasAttribute(FIXED_PAGE_ATTRIBUTE) &&
    main.parentElement?.querySelector(':scope > aside') === null
  );
}
