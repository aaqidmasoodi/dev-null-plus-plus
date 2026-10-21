import { OWNED_ATTRIBUTE } from '@/core/constants';

import { SELECTORS } from './selectors';

/** Pictures smaller than this, on the page or in the file, are icons and decoration: not worth a peek. */
const MIN_SHOWN_PX = 24;
const MIN_NATURAL_PX = 48;

/** The site's avatars (components/user-avatar.tsx, through components/ui/avatar.tsx). */
const AVATAR = 'img[data-slot="avatar-image"]';
/** The composer, where your own avatar sits next to "What did you ship?" (components/commit-composer.tsx). */
const COMPOSER = '[data-test="commit-composer"]';
/** A profile's own avatar sits in the page's header, on its `/@username` page (pages/user/show.tsx). */
const PROFILE_HEADER = `${SELECTORS.main} header`;
const PROFILE_PATH = /^\/@[^/]+\/?$/;
/** GitHub serves its avatars at any size asked for with `s`, up to the size they were uploaded at. */
const GITHUB_AVATARS = 'avatars.githubusercontent.com';
const LARGEST_AVATAR_PX = 2048;

/**
 * Of the site's avatars, only two are worth a peek: a profile's own, on its page, and your own in the composer.
 * Everywhere else, hovering an avatar opens the site's card about the person, and a peek would fight it.
 */
function isPeekableAvatar(image: HTMLImageElement): boolean {
  return (
    image.closest(COMPOSER) !== null || (PROFILE_PATH.test(location.pathname) && image.closest(PROFILE_HEADER) !== null)
  );
}

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
    target.hasAttribute('data-fallback') ||
    (target.matches(AVATAR) && !isPeekableAvatar(target))
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

/**
 * The same GitHub avatar at `pixels` across, for a peek to show it sharp at its full size, or `null` for any other
 * picture. Only ever the same address on GitHub's avatar host, with a different size.
 */
export function largerAvatar(src: string, pixels: number): string | null {
  let url: URL;

  try {
    url = new URL(src);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.hostname !== GITHUB_AVATARS) {
    return null;
  }

  url.searchParams.set('s', String(Math.min(LARGEST_AVATAR_PX, Math.ceil(pixels))));

  return url.toString() === src ? null : url.toString();
}
