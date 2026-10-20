import { OWNED_ATTRIBUTE } from '@/core/constants';

import { SELECTORS } from './selectors';

/** Pictures smaller than this, on the page or in the file, are icons and decoration: not worth a peek. */
const MIN_SHOWN_PX = 24;
const MIN_NATURAL_PX = 48;

/**
 * Images that can be peeked at, loaded or not: pictures in the site's own app, shown big enough to be content. Not our
 * own UI, not pictures already shown large in the site's own viewer or other dialogs, and not the favicon the site
 * swaps in for an image that failed (`data-fallback`, from resources/js/components/commit-images.tsx).
 *
 * The site lazy-loads images, so one just scrolled to may still be on its way; {@link isReadyToPeek} says when it has
 * arrived.
 */
export function peekCandidate(target: EventTarget | null): HTMLImageElement | null {
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

  const shown = target.getBoundingClientRect();

  return shown.width >= MIN_SHOWN_PX && shown.height >= MIN_SHOWN_PX ? target : null;
}

/** Whether a candidate's picture has arrived, and is big enough in the file to be worth showing large. */
export function isReadyToPeek(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth >= MIN_NATURAL_PX && image.naturalHeight >= MIN_NATURAL_PX;
}

/** Images that can be peeked at right now. */
export function peekableImage(target: EventTarget | null): HTMLImageElement | null {
  const image = peekCandidate(target);

  return image !== null && isReadyToPeek(image) ? image : null;
}
