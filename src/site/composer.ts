/**
 * dev-null.sh's composers: where commits, replies and quotes are written. Cross-checked against the site's source:
 * components/commit-composer.tsx (the log page and the compose dialog), components/commit-thread.tsx (replies) and
 * components/commit-quote-button.tsx (quotes).
 *
 * Every composer has an image-picker button in its toolbar; the commit composer also has a schedule toggle. Our
 * button goes right after the last of those, and our panel opens just above the toolbar, where the schedule panel
 * opens.
 */

const COMPOSER_ROOTS = ['commit-composer', 'reply-composer', 'quote-composer'] as const;

export type ComposerKind = (typeof COMPOSER_ROOTS)[number];

export interface ComposerParts {
  root: HTMLElement;
  kind: ComposerKind;
  textarea: HTMLTextAreaElement;
  /** The site's icon button ours goes after, and copies its look from. */
  anchor: HTMLElement;
  /** The toolbar row. Our panel goes just before it. */
  toolbar: HTMLElement;
}

const ROOT_SELECTOR = COMPOSER_ROOTS.map((kind) => `[data-test="${kind}"]`).join(', ');

function partsOf(root: HTMLElement): ComposerParts | null {
  const kind = COMPOSER_ROOTS.find((candidate) => root.dataset.test === candidate);
  const textarea = root.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
  const anchor =
    root.querySelector<HTMLElement>('[data-test="schedule-toggle"]') ??
    root.querySelector<HTMLElement>('[data-test="attach-images-button"]');
  const toolbar = anchor?.parentElement?.parentElement;

  if (kind === undefined || textarea === null || anchor === null || toolbar === null || toolbar === undefined) {
    return null;
  }

  if (!root.contains(toolbar)) {
    return null;
  }

  return { root, kind, textarea, anchor, toolbar };
}

export function findComposers(root: ParentNode = document): ComposerParts[] {
  return [...root.querySelectorAll<HTMLElement>(ROOT_SELECTOR)]
    .map(partsOf)
    .filter((parts): parts is ComposerParts => parts !== null);
}

/** The composer's own length limit, from its textarea, capped at what the extension will send. */
export function composerMaxLength(textarea: HTMLTextAreaElement, cap: number): number {
  return textarea.maxLength > 0 ? Math.min(textarea.maxLength, cap) : cap;
}

/**
 * Replaces the draft the way typing would, so the site's React state follows.
 *
 * The composers are controlled by React, which ignores a plain `textarea.value = ...`. Setting the value through the
 * prototype's own setter and then dispatching `input` makes React see a change and run its own handlers (emoji
 * shortcodes, the length limit, the stashed draft), exactly as if the user had typed it.
 */
export function setComposerText(textarea: HTMLTextAreaElement, text: string): void {
  if (!Reflect.set(HTMLTextAreaElement.prototype, 'value', text, textarea)) {
    throw new Error('Cannot set the composer text in this browser.');
  }

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}
