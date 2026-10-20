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

export const SELECTORS = {
  /** The React root the server-rendered page hydrates into. */
  appRoot: '#app',
  /** The desktop and tablet left rail. Hidden below the `md` breakpoint, where the site shows a bottom bar instead. */
  navRail: '[data-nav-rail]',
  /** The list of links and buttons inside the rail. */
  mainNav: '[data-nav-rail] nav[aria-label="Main"]',
} as const;

/** Signed in, Settings links to `/settings/profile`. Signed out, every item links to the sign-in page instead. */
const SETTINGS_PATH_PREFIX = '/settings';
const SETTINGS_LABEL = 'Settings';

export function findMainNav(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(SELECTORS.mainNav);
}

function navLinks(nav: HTMLElement): HTMLAnchorElement[] {
  return [...nav.children].filter((child): child is HTMLAnchorElement => child instanceof HTMLAnchorElement);
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
