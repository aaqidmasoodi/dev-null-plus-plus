import { OWNED_ATTRIBUTE } from '@/core/constants';
import { markOwned, ownedSelector } from '@/core/dom';

import { SELECTORS } from './selectors';

/** Set on `<html>` while one of our pages is showing in the middle column. */
export const VIEW_ATTRIBUTE = 'data-dnpp-view';

const STYLE_ROLE = 'takeover-style';

/**
 * While our page shows, the site's own page is hidden rather than removed, so React keeps its state and going Back is
 * instant. The site still marks its own nav link as current, so that link is muted and ours is highlighted instead.
 */
const CSS = `
html[${VIEW_ATTRIBUTE}] ${SELECTORS.mainContent} {
  display: none !important;
}

html[${VIEW_ATTRIBUTE}] ${SELECTORS.mainNav} > a[aria-current="page"]:not([${OWNED_ATTRIBUTE}]) {
  color: var(--muted-foreground) !important;
}

html[${VIEW_ATTRIBUTE}] ${SELECTORS.mainNav} > a[aria-current="page"]:not([${OWNED_ATTRIBUTE}]) > span[aria-hidden] {
  display: none !important;
}
`;

/** Adds the stylesheet once. It only does anything while {@link VIEW_ATTRIBUTE} is set. */
function ensureStyle(): void {
  if (document.head.querySelector(ownedSelector(STYLE_ROLE)) !== null) {
    return;
  }

  const style = document.createElement('style');

  markOwned(style, STYLE_ROLE);
  style.textContent = CSS;
  document.head.append(style);
}

/** Shows `view` in place of the site's page, or the site's page again for `null`. Cheap to call repeatedly. */
export function setTakeover(view: string | null): void {
  const root = document.documentElement;

  if (root.getAttribute(VIEW_ATTRIBUTE) === view) {
    return;
  }

  if (view === null) {
    root.removeAttribute(VIEW_ATTRIBUTE);

    return;
  }

  ensureStyle();
  root.setAttribute(VIEW_ATTRIBUTE, view);
}

export function removeTakeover(): void {
  setTakeover(null);
  document.head.querySelector(ownedSelector(STYLE_ROLE))?.remove();
}
