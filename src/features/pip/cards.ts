import { createSvgIcon, el, markOwned } from '@/core/dom';
import { SiteTooltip } from '@/features/ai-rewrite/tooltip';

import styles from './cards.css?inline';
import { PLAYER_ROLE } from './player';

export const CARDS_ROLE = 'pip-cards';

const PIP_ICON = [
  'M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4',
  'M14 13h6a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z',
] as const;
const PLAY_ICON = ['M6 3 20 12 6 21Z'] as const;
const PIP_LABEL = 'Picture-in-picture';

/**
 * - `elsewhere-pip`: the video floats in picture-in-picture; Play here brings it into this embed.
 * - `elsewhere-post`: the video plays in another post; Play here brings it here.
 * - `replay`: we played it here and it stopped; the site's poster and play button, which it can no longer show.
 * - `poster`: the player is on its way into this embed; only the poster, so nothing shows behind it as it lands.
 */
export type CardKind = 'elsewhere-pip' | 'elsewhere-post' | 'replay' | 'poster';

export interface Card {
  slot: HTMLElement;
  kind: CardKind;
  poster: string | null;
  title: string;
  /** Play here, or play again. */
  onPlay: () => void;
}

export interface PipButton {
  /** The row under the video the button sits at the end of. */
  row: HTMLElement;
  onPress: () => void;
}

interface Shown {
  element: HTMLElement;
  kind: CardKind;
  card: Card;
}

/** Where an element is on the page, in document coordinates, so what we lay over it scrolls with it natively. */
function documentRect(element: HTMLElement): DOMRect {
  const rect = element.getBoundingClientRect();

  return new DOMRect(rect.left + window.scrollX, rect.top + window.scrollY, rect.width, rect.height);
}

/** The embed's card rounds its top corners, so what covers its video does too. */
function slotRadius(slot: HTMLElement): string {
  const card = slot.parentElement;

  if (card === null) {
    return '0px';
  }

  const style = getComputedStyle(card);
  const border = Number.parseFloat(style.borderTopWidth) || 0;
  const radius = Math.max(0, (Number.parseFloat(style.borderTopLeftRadius) || 0) - border);

  return `${String(radius)}px ${String(radius)}px 0 0`;
}

function place(element: HTMLElement, rect: DOMRect): void {
  Object.assign(element.style, {
    transform: `translate(${String(rect.left)}px, ${String(rect.top)}px)`,
    width: `${String(rect.width)}px`,
    height: `${String(rect.height)}px`,
  });
}

/**
 * Everything we lay over the site's video embeds, in one layer of our own. Nothing the site renders is changed: each
 * card sits over its embed, in the page's own layer, so the site's sticky headers and bars still cover it.
 */
export class Cards {
  readonly #host: HTMLElement;
  readonly #root: ShadowRoot;
  readonly #shown = new Map<HTMLElement, Shown>();
  #pip: { element: HTMLButtonElement; tooltip: SiteTooltip; button: PipButton } | null = null;

  constructor() {
    this.#host = el('div');
    markOwned(this.#host, CARDS_ROLE);
    this.#root = this.#host.attachShadow({ mode: 'open' });
    this.#root.append(el('style', {}, [styles]));
    // Keys pressed in our buttons must not reach the site's single-key shortcuts.
    this.#host.addEventListener('keydown', (event) => {
      event.stopPropagation();
    });
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.#host.dataset.theme = theme;
  }

  /** Shows exactly these cards and this button, each over its embed as it stands now. */
  render(cards: readonly Card[], pip: PipButton | null): void {
    if (cards.length === 0 && pip === null) {
      this.destroy();

      return;
    }

    // Before the player, on the same layer, so the player flying home into its embed passes over the poster there,
    // not under it.
    if (!this.#host.isConnected) {
      document.documentElement.insertBefore(this.#host, document.querySelector(`[data-dnpp="${PLAYER_ROLE}"]`));
    }

    const wanted = new Map(cards.map((card) => [card.slot, card]));

    for (const [slot, shown] of this.#shown) {
      if (wanted.get(slot)?.kind !== shown.kind) {
        shown.element.remove();
        this.#shown.delete(slot);
      }
    }

    for (const card of cards) {
      let shown = this.#shown.get(card.slot);

      if (shown === undefined) {
        shown = { element: this.#createCard(card), kind: card.kind, card };
        this.#shown.set(card.slot, shown);
        this.#root.append(shown.element);
      }

      shown.card = card;
      place(shown.element, documentRect(card.slot));
      shown.element.style.borderRadius = slotRadius(card.slot);
    }

    this.#renderPip(pip);
  }

  destroy(): void {
    for (const shown of this.#shown.values()) {
      shown.element.remove();
    }

    this.#shown.clear();
    this.#renderPip(null);
    this.#host.remove();
  }

  #createCard(card: Card): HTMLElement {
    const element = el('div', { className: 'card', attrs: { 'data-kind': card.kind, 'data-test': 'dnpp-pip-card' } });
    const poster = el('img', { className: 'poster', attrs: { alt: '', referrerpolicy: 'no-referrer' } });
    // Reads the latest card, as the same element is kept while the video moves between embeds.
    const play = (): void => {
      this.#shown.get(card.slot)?.card.onPlay();
    };

    if (card.poster !== null) {
      poster.src = card.poster;
    }

    poster.addEventListener('error', () => {
      poster.removeAttribute('src');
    });

    if (card.kind === 'poster') {
      element.append(poster);

      return element;
    }

    if (card.kind === 'replay') {
      const button = el('button', { className: 'replay', attrs: { type: 'button', 'aria-label': card.title } }, [
        el('span', { className: 'button', attrs: { 'aria-hidden': 'true' } }, [createSvgIcon(PLAY_ICON, 'filled')]),
      ]);

      button.addEventListener('click', play);
      element.append(poster, button);

      return element;
    }

    const playHere = el(
      'button',
      { className: 'play-here', attrs: { type: 'button', 'data-test': 'dnpp-pip-play-here' } },
      [createSvgIcon(PLAY_ICON, 'filled'), 'Play here'],
    );

    playHere.addEventListener('click', play);
    element.append(
      poster,
      el('div', { className: 'elsewhere' }, [
        createSvgIcon(PIP_ICON, ''),
        el('span', { className: 'label' }, [
          card.kind === 'elsewhere-pip' ? 'Playing in picture-in-picture' : 'Playing in another post',
        ]),
        playHere,
      ]),
    );

    return element;
  }

  #renderPip(pip: PipButton | null): void {
    if (pip === null) {
      this.#pip?.tooltip.destroy();
      this.#pip?.element.remove();
      this.#pip = null;

      return;
    }

    if (this.#pip === null) {
      const element = el(
        'button',
        {
          className: 'pip',
          attrs: { type: 'button', 'aria-label': 'Play in picture-in-picture', 'data-test': 'dnpp-pip-button' },
        },
        [createSvgIcon(PIP_ICON, '')],
      );

      element.addEventListener('click', () => {
        this.#pip?.tooltip.hide();
        this.#pip?.button.onPress();
      });
      this.#root.append(element);
      this.#pip = { element, tooltip: new SiteTooltip(element, element, () => PIP_LABEL), button: pip };
    }

    this.#pip.button = pip;

    const row = documentRect(pip.row);
    const size = 36;

    place(this.#pip.element, new DOMRect(row.right - size - 8, row.top + (row.height - size) / 2, size, size));
  }
}
