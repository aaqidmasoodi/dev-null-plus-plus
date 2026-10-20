import { OWNED_ATTRIBUTE, SITE_ORIGIN } from '@/core/constants';

import { SELECTORS } from './selectors';

/**
 * Sites known to refuse being shown inside another page (`X-Frame-Options` or CSP `frame-ancestors`). A preview of
 * them would only ever be the browser's "refused to connect" page, so their links keep behaving like plain links.
 * Subdomains count too: `gist.github.com` is covered by `github.com`.
 */
export const FRAME_REFUSING_SITES: readonly string[] = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'threads.net',
  'reddit.com',
  'news.ycombinator.com',
  'stackoverflow.com',
  'stackexchange.com',
  'npmjs.com',
  'packagist.org',
  'pypi.org',
  'google.com',
  'apple.com',
  'amazon.com',
  'discord.com',
  'discord.gg',
  't.me',
  'producthunt.com',
  'vercel.com',
  'laravel.com',
  'nunomaduro.com',
];

export function refusesFraming(url: URL): boolean {
  const host = url.hostname.replace(/^www\./, '');

  return FRAME_REFUSING_SITES.some((site) => host === site || host.endsWith(`.${site}`));
}

/**
 * Links that can be previewed: ones in the site's own app that lead off dev-null.sh, to an https page that does not
 * refuse to be framed. Links to dev-null.sh itself are left to the site's router, and links in our own UI are
 * never touched.
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

  // https only: an https page like dev-null.sh is never allowed to show an http one inside it.
  if (url.protocol !== 'https:' || url.origin === SITE_ORIGIN || refusesFraming(url)) {
    return null;
  }

  return { link, url };
}
