import { OWNED_ATTRIBUTE } from '@/core/constants';

import { SELECTORS } from './selectors';

/** Pictures smaller than this, on the page or in the file, are icons and decoration: not worth a peek. */
const MIN_SHOWN_PX = 24;
const MIN_NATURAL_PX = 48;

/**
 * Images that can be peeked at: loaded pictures in the site's own app, big enough to be content. Not our own UI, not
 * pictures already shown large in the site's own viewer or other dialogs, and not the favicon the site swaps in for an
 * image that failed (`data-fallback`, from resources/js/components/commit-images.tsx).
 */
export function peekableImage(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof HTMLImageElement)) {
    return null;
  }

  if (
    target.closest(`[${OWNED_ATTRIBUTE}]`) !== null ||
    target.closest(SELECTORS.appRoot) === null ||
    target.closest('dialog, [role="dialog"]') !== null ||
    target.hasAttribute('data-fallback')
  ) {
    return null;
  }

  if (!target.complete || target.naturalWidth < MIN_NATURAL_PX || target.naturalHeight < MIN_NATURAL_PX) {
    return null;
  }

  const shown = target.getBoundingClientRect();

  return shown.width >= MIN_SHOWN_PX && shown.height >= MIN_SHOWN_PX ? target : null;
}
