import { OWNED_ATTRIBUTE } from '@/core/constants';

import { SELECTORS } from './selectors';

/**
 * Video embeds on dev-null.sh, from resources/js/components/link-embed.tsx:
 *
 * - The card is `[data-test="link-embed"]`, with the provider in `data-provider`.
 * - Before playing, its first child holds a `<button data-test="link-embed-play">` sized with an inline `aspect-ratio`,
 *   with the poster `<img>` inside and "Play {title} from {provider}" as its label. Pressing it swaps the button for
 *   the provider's `<iframe>` in the same place.
 * - Below sits a link to the original page: the row the picture-in-picture button goes in.
 * - Audio and code embeds have no aspect ratio, and quoted embeds have no button: neither is a video we can play.
 */

const CARD = '[data-test="link-embed"]';
const PLAY = '[data-test="link-embed-play"]';

export interface VideoEmbed {
  card: HTMLElement;
  /** Where the video plays: the area the play button, and then the frame, fill. */
  slot: HTMLElement;
  /** The link to the original page, below the video. */
  row: HTMLElement | null;
  key: string;
  title: string;
  poster: string | null;
  aspectRatio: number;
}

/** What a card was when it was played, kept because playing replaces the button that says it. */
const playedCards = new WeakMap<HTMLElement, Omit<VideoEmbed, 'card' | 'slot' | 'row'>>();

function ratioOf(element: HTMLElement): number | null {
  const [width = Number.NaN, height = Number.NaN] = element.style.aspectRatio
    .split('/')
    .map((side) => Number.parseFloat(side));

  return width > 0 && height > 0 ? width / height : null;
}

/** The slot a card's video plays in: the element the play button or frame sits in. */
function slotOf(card: HTMLElement): HTMLElement | null {
  const first = card.firstElementChild;

  return first instanceof HTMLElement && first.tagName === 'DIV' ? first : null;
}

function rowOf(card: HTMLElement): HTMLElement | null {
  const last = card.lastElementChild;

  return last instanceof HTMLAnchorElement && last !== card.firstElementChild ? last : null;
}

/**
 * Reads a card. A card not yet played is read from its play button; one we played is remembered. Anything else, like
 * an audio embed, a quoted one, or a card the site played on its own, is not a video we handle.
 */
export function readVideoEmbed(card: HTMLElement): VideoEmbed | null {
  const slot = slotOf(card);

  if (slot === null) {
    return null;
  }

  const button = slot.querySelector<HTMLButtonElement>(`:scope > ${PLAY}`);

  if (button === null) {
    const played = playedCards.get(card);

    return played === undefined ? null : { ...played, card, slot, row: rowOf(card) };
  }

  const aspectRatio = ratioOf(button);

  if (aspectRatio === null) {
    return null;
  }

  const title = button.getAttribute('aria-label') ?? '';
  const poster = button.querySelector('img')?.getAttribute('src') ?? null;
  const provider = card.dataset.provider ?? '';

  return {
    card,
    slot,
    row: rowOf(card),
    // The same video posted twice reads the same, so either copy can take it back.
    key: `${provider}\n${title}\n${poster ?? ''}`,
    title,
    poster,
    aspectRatio,
  };
}

/** Remembers what a card was as it is played, before the site replaces its button with a frame. */
export function rememberPlayedCard(embed: VideoEmbed): void {
  playedCards.set(embed.card, {
    key: embed.key,
    title: embed.title,
    poster: embed.poster,
    aspectRatio: embed.aspectRatio,
  });
}

/** The card of a play button that was pressed, if it is a video. */
export function pressedVideoEmbed(target: EventTarget | null): VideoEmbed | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const card = target.closest<HTMLElement>(PLAY)?.closest<HTMLElement>(CARD) ?? null;

  return card === null ? null : readVideoEmbed(card);
}

/** Whether a press was on any embed's play button, video or not. */
export function isEmbedPlayPress(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(PLAY) !== null;
}

/**
 * Only embeds in the main page, scrolled by the window, can float. One in a chat, a dialog, the photo viewer or any
 * other panel that scrolls on its own plays in place, as the site plays it.
 */
export function canFloat(card: HTMLElement): boolean {
  return (
    card.closest(SELECTORS.main) !== null &&
    card.closest(`dialog, [role="dialog"], [data-test="chat-dock"], [${OWNED_ATTRIBUTE}]`) === null
  );
}

/** Every video embed in the main page that can float, in page order. */
export function floatingVideoEmbeds(): VideoEmbed[] {
  return [...document.querySelectorAll<HTMLElement>(`${SELECTORS.main} ${CARD}`)]
    .filter(canFloat)
    .map(readVideoEmbed)
    .filter((embed): embed is VideoEmbed => embed !== null);
}

/** The frame the site put in a card's slot when it was played. */
export function siteFrameIn(card: HTMLElement): HTMLIFrameElement | null {
  return slotOf(card)?.querySelector<HTMLIFrameElement>(':scope > iframe') ?? null;
}

/** Whether an element is on the page and laid out, rather than removed or hidden, like under our settings page. */
export function isShown(element: Element): boolean {
  if (!element.isConnected) {
    return false;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
}

/**
 * The site's fixed and sticky bars, found by what sits at the screen's edges rather than by name: headers stuck along
 * the top of the main column, and the mobile nav and chat dock fixed along the bottom. Our own elements are skipped.
 */
function edgeBars(y: number, xs: readonly number[], isBar: (rect: DOMRect) => boolean): DOMRect[] {
  const found = new Set<Element>();
  const bars: DOMRect[] = [];

  for (const x of xs) {
    for (const element of document.elementsFromPoint(x, y)) {
      if (found.has(element) || element.closest(`[${OWNED_ATTRIBUTE}]`) !== null) {
        continue;
      }

      found.add(element);

      const position = getComputedStyle(element).position;

      if (position === 'fixed' || position === 'sticky') {
        const rect = element.getBoundingClientRect();

        if (isBar(rect)) {
          bars.push(rect);
        }
      }
    }
  }

  return bars;
}

function samplePoints(width: number): number[] {
  return [0.04, 0.2, 0.4, 0.6, 0.8, 0.96].map((share) => Math.round(width * share));
}

/** Headers stuck to the top: short bars touching the top edge. Tall fixed columns, like the nav rail, are not. */
export function stickyHeaders(viewport: { width: number; height: number }): DOMRect[] {
  return edgeBars(
    1,
    samplePoints(viewport.width),
    (rect) => rect.top <= 1 && rect.height > 0 && rect.height < viewport.height * 0.4,
  );
}

/** Bars fixed to the bottom: short ones touching the bottom edge, such as the mobile nav and the chat dock. */
export function bottomBars(viewport: { width: number; height: number }): DOMRect[] {
  return edgeBars(
    viewport.height - 2,
    samplePoints(viewport.width),
    (rect) => rect.bottom >= viewport.height - 2 && rect.height > 0 && rect.height < viewport.height * 0.6,
  );
}
