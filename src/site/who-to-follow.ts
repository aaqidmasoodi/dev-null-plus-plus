/**
 * The site's "Who to follow" suggestions (resources/js/components/who-to-follow.tsx): a block in the aside, and the same
 * block inside the log on screens too narrow for the aside. Each shows up to three people as rows, each with a link to
 * the profile, a follow button and a "Not interested" button that swaps in the next suggestion.
 *
 * Only signed-in readers get these blocks. Everything is read from the rows as the site renders them, and every action
 * goes through the site's own buttons, so nothing is ever asked of the server that the site would not ask itself.
 */

/** The block in the aside, and the one in the log, by the ids of their headings. */
export const WHO_TO_FOLLOW_SECTIONS =
  'section[aria-labelledby="aside-who-to-follow"], section[aria-labelledby="log-who-to-follow"]';

const FOLLOW_BUTTON = '[data-test="suggested-follow-button"]';
const DISMISS_BUTTON = '[data-test="suggested-dismiss-button"]';
const AVATAR_IMAGE = 'img[data-slot="avatar-image"]';
const AVATAR_FALLBACK = '[data-slot="avatar-fallback"]';
const PROFILE_PATH = /^\/@([^/]+)\/?$/;

/** One suggested person, as the site's row shows them, with the row's own buttons to act through. */
export interface Suggestion {
  username: string;
  name: string;
  avatar: string | null;
  /** The person's initials, which the site shows when there is no avatar. */
  initials: string;
  /** Their lane's colour, as the site draws the dot by their username. */
  lane: string | null;
  bio: string | null;
  /** Why they are suggested, such as "Followed by 2 you follow". */
  reason: string | null;
  isFollowing: boolean;
  followsYou: boolean;
  link: HTMLAnchorElement;
  follow: HTMLElement;
  dismiss: HTMLElement | null;
}

/** The list of rows in a block, once it holds people rather than the loading placeholders. */
export function suggestionList(section: Element): HTMLUListElement | null {
  return section.querySelector('ul');
}

/** Text that says something, or `null` for none or only spaces. */
function textOf(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';

  return text === '' ? null : text;
}

function readRow(row: HTMLLIElement): Suggestion | null {
  const link = [...row.querySelectorAll<HTMLAnchorElement>('a[href]')].find((anchor) =>
    PROFILE_PATH.test(new URL(anchor.href, location.href).pathname),
  );
  const follow = row.querySelector<HTMLElement>(FOLLOW_BUTTON);

  if (link === undefined || follow === null) {
    return null;
  }

  const username = PROFILE_PATH.exec(new URL(link.href, location.href).pathname)?.[1];

  if (username === undefined) {
    return null;
  }

  const image = row.querySelector<HTMLImageElement>(AVATAR_IMAGE);
  // The link holds the avatar, then the name over the username: the name is the first line of the text.
  const name = link.querySelector(':scope > span:last-child > span:first-child')?.textContent.trim() ?? '';
  const dot = link.querySelector<HTMLElement>('span[aria-hidden][style]');
  const titled = [...row.querySelectorAll<HTMLElement>('span[title]')];
  // The bio is written as a comment, `# bio`, with the `#` hidden from screen readers.
  const bio = titled.find((span) => span.querySelector('[aria-hidden]') !== null);
  const reason = titled.find((span) => span !== bio);
  const label = follow.getAttribute('aria-label') ?? '';

  return {
    username: decodeURIComponent(username),
    name: name === '' ? (image?.alt ?? username) : name,
    avatar: image === null ? null : image.currentSrc || image.src,
    initials: row.querySelector(AVATAR_FALLBACK)?.textContent.trim() ?? '',
    lane: dot === null ? null : getComputedStyle(dot).backgroundColor,
    bio: textOf(bio?.getAttribute('title')),
    reason: textOf(reason?.getAttribute('title')),
    isFollowing: label.startsWith('Unfollow'),
    followsYou: label.endsWith(' back'),
    link,
    follow,
    dismiss: row.querySelector<HTMLElement>(DISMISS_BUTTON),
  };
}

/**
 * The people a block suggests right now, in order. Rows still loading are placeholders, and rows on their way out after
 * "Not interested" are inert while they fold away: neither counts.
 */
export function readSuggestions(list: HTMLUListElement): Suggestion[] {
  return [...list.children]
    .filter((row): row is HTMLLIElement => row instanceof HTMLLIElement)
    .filter((row) => !row.hasAttribute('aria-hidden') && !row.inert)
    .map(readRow)
    .filter((suggestion) => suggestion !== null);
}
