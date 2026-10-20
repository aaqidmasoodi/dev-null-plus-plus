import { OWNED_ATTRIBUTE, SITE_ORIGIN } from '@/core/constants';

import { SELECTORS } from './selectors';

/**
 * Links that can be previewed: ones in the site's own app that lead off dev-null.sh, to an http or https page. Links
 * to dev-null.sh itself are left to the site's router, and links in our own UI are never touched.
 */
export function previewableLink(target: EventTarget | null): { link: HTMLAnchorElement; url: URL } | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const link = target.closest<HTMLAnchorElement>('a[href]');

  if (link === null) {
    return null;
  }

  // Only the site's own links: not ours, and not anything outside its app.
  if (link.closest(`[${OWNED_ATTRIBUTE}]`) !== null || link.closest(SELECTORS.appRoot) === null) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(link.href, location.href);
  } catch {
    return null;
  }

  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin === SITE_ORIGIN) {
    return null;
  }

  return { link, url };
}
