/**
 * dev-null.sh's log pages (Following and Latest), from resources/js/pages/log/show.tsx, checked against the live site
 * on 2026-10-20.
 *
 * Every 30 seconds the page asks how many commits are newer than the top one (`?since=<id>`, only
 * `newCommitsCount`). When there are some, it shows a pill under the tabs, "↑ 3 new commits". Clicking it reloads the
 * feed from the newest commit and scrolls to the top. Trending is ranked, never polls, and never shows the pill.
 *
 * The pill has no `data-test` attribute, unlike most of the site, so it is found by its words and its place: a button
 * in the middle column reading "N new commit(s)", with an icon. That is the narrowest match the markup allows, and the
 * e2e suite checks it against the live site.
 */

import { SELECTORS } from './selectors';

const PILL_TEXT = /^\s*(\d{1,4})\s+new commits?\s*$/;

export interface NewCommitsPill {
  button: HTMLButtonElement;
  count: number;
}

export function findNewCommitsPill(root: ParentNode = document): NewCommitsPill | null {
  const content = root.querySelector(SELECTORS.mainContent);

  if (content === null) {
    return null;
  }

  for (const button of content.querySelectorAll<HTMLButtonElement>('button')) {
    const match = PILL_TEXT.exec(button.textContent);

    if (match !== null && button.querySelector('svg') !== null) {
      return { button, count: Number(match[1]) };
    }
  }

  return null;
}

/** The feed's commits, in order: the top-level ones only, not the replies shown under them. */
export function feedCommits(root: ParentNode = document): HTMLElement[] {
  const content = root.querySelector(SELECTORS.mainContent);

  if (content === null) {
    return [];
  }

  return [...content.querySelectorAll<HTMLElement>('[data-commit]')].filter(
    (element) => element.parentElement?.closest('[data-commit]') === null,
  );
}

/**
 * Whether the user is in the middle of something a feed reload could disturb: writing a reply or a quote, or a
 * dialog. Reloading resets the feed, which can unmount the commit they are replying to.
 */
export function isBusyWithFeed(root: Document = document): boolean {
  return root.querySelector('[data-test="reply-composer"], [data-test="quote-composer"], [role="dialog"]') !== null;
}
