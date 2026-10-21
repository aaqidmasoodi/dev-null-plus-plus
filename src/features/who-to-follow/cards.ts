import { createSvgIcon, el, markOwned, ownedSelector } from '@/core/dom';
import { CLOSE_ICON } from '@/core/icons';
import { largerAvatar } from '@/site/images';
import { readSuggestions, suggestionList, WHO_TO_FOLLOW_SECTIONS, type Suggestion } from '@/site/who-to-follow';

import styles from './cards.css?inline';

export const CARDS_ROLE = 'who-to-follow';
const STYLE_ROLE = 'who-to-follow-style';

/** Lucide icons, to match the site's. */
const ICONS = {
  follow: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M19 8v6', 'M22 11h-6'],
  following: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'm16 11 2 2 4-4'],
} as const;

/** How far a card has to be dragged, as a share of its width, to go. Less than that and it settles back. */
const SWIPE_SHARE = 0.3;
/** A quick flick goes however short it was, in pixels per millisecond. */
const FLICK_SPEED = 0.5;
/** Movement before a press counts as a drag, not a click on the picture or the name. */
const SLOP_PX = 6;
/** How many people show in the stack at once: the one on top, and two peeking out behind. */
const STACK = 3;

type Direction = 'left' | 'right';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * While our cards stand in for a block's rows, the rows are hidden, but only while our cards are right there: if the
 * cards are ever missing, the site's own rows show as always. The rows stay in the page, so their buttons still work.
 */
function hideRowsStyle(): HTMLStyleElement {
  const style = el('style', {}, [
    `:is(${WHO_TO_FOLLOW_SECTIONS}) ul:has(+ ${ownedSelector(CARDS_ROLE)}) { display: none !important; }`,
  ]);

  markOwned(style, STYLE_ROLE);

  return style;
}

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  samples: { x: number; time: number }[];
  isDragging: boolean;
}

/**
 * One block's suggestions as a stack of cards: the person on top with a big picture, their details under it, and
 * Follow and "Not interested". Swiping the top card away, either way, is the row's own "Not interested": the site
 * brings in someone new, as it always does, and they join the stack at the back. Someone you follow is never marked
 * "Not interested"; swiped, they just go to the back.
 */
class Deck {
  readonly host: HTMLElement;
  readonly #stage: HTMLElement;
  /** Who is in the stack, top first, by username. The site's own order only decides where newcomers join: the back. */
  #order: string[] = [];
  #people: Suggestion[] = [];
  #drawn = '';
  #drag: Drag | null = null;
  #isMoving = false;

  constructor() {
    this.host = el('div');
    markOwned(this.host, CARDS_ROLE);
    this.#stage = el('div', {
      className: 'stage',
      attrs: { role: 'group', 'aria-roledescription': 'cards', 'aria-label': 'Who to follow', 'aria-live': 'polite' },
    });
    this.host.attachShadow({ mode: 'open' }).append(el('style', {}, [styles]), this.#stage);
    // Keys pressed here must not reach the site's single-key shortcuts. The arrow keys swipe.
    this.host.addEventListener('keydown', (event) => {
      event.stopPropagation();

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.#swipeAway(event.key === 'ArrowLeft' ? 'left' : 'right');
      }
    });
    this.#stage.addEventListener('pointerdown', this.#onPointerDown);
    this.#stage.addEventListener('pointermove', this.#onPointerMove);
    this.#stage.addEventListener('pointerup', this.#onPointerUp);
    this.#stage.addEventListener('pointercancel', this.#onPointerUp);
  }

  /**
   * Follows the block's rows as they change: whoever is still suggested keeps their place in the stack, whoever is
   * gone leaves it, and whoever is new joins at the back.
   */
  update(people: Suggestion[]): void {
    const byName = new Map(people.map((person) => [person.username, person]));
    const kept = this.#order.filter((username) => byName.has(username));
    const joined = people.map((person) => person.username).filter((username) => !kept.includes(username));

    this.#order = [...kept, ...joined];
    this.#people = this.#order.map((username) => byName.get(username)).filter((person) => person !== undefined);

    if (!this.#isMoving) {
      this.#draw();
    }
  }

  /** Draws the stack, only when something about it changed, so a re-render of the site's rows costs nothing. */
  #draw(): void {
    const shown = this.#people.slice(0, STACK);
    const drawn = JSON.stringify(
      shown.map((person) => [
        person.username,
        person.name,
        person.avatar,
        person.bio,
        person.reason,
        person.isFollowing,
      ]),
    );

    if (drawn === this.#drawn) {
      return;
    }

    this.#drawn = drawn;
    this.#stage.replaceChildren(...shown.map((person, depth) => this.#card(person, depth)).reverse());
  }

  #card(person: Suggestion, depth: number): HTMLElement {
    const isTop = depth === 0;
    const picture = el('div', { className: 'picture' });

    if (person.avatar === null) {
      picture.append(el('span', { className: 'initials' }, [person.initials]));
    } else {
      const small = el('img', { attrs: { alt: '', draggable: 'false', referrerpolicy: 'no-referrer' } });

      small.src = person.avatar;
      picture.append(small);

      // The site's avatar is a small one; the card shows the same avatar large, sharp once it has arrived.
      const larger = largerAvatar(person.avatar, 320 * window.devicePixelRatio);

      if (larger !== null) {
        const sharp = el('img', {
          className: 'sharp',
          attrs: { alt: '', draggable: 'false', referrerpolicy: 'no-referrer' },
        });

        sharp.addEventListener(
          'load',
          () => {
            sharp.classList.add('loaded');
          },
          { once: true },
        );
        sharp.src = larger;
        picture.append(sharp);
      }
    }

    const username = el('span', { className: 'username' }, [`@${person.username}`]);

    if (person.lane !== null) {
      const dot = el('span', { className: 'dot', attrs: { 'aria-hidden': 'true' } });

      dot.style.background = person.lane;
      username.prepend(dot);
    }

    const name = el('a', { className: 'name', attrs: { href: person.link.href } }, [person.name]);
    const card = el(
      'article',
      {
        className: 'card',
        attrs: { 'data-depth': String(depth), 'aria-label': `${person.name}, @${person.username}` },
      },
      [
        picture,
        el('div', { className: 'info' }, [
          name,
          username,
          person.bio !== null && el('p', { className: 'bio', attrs: { title: person.bio } }, [`# ${person.bio}`]),
          person.reason !== null && el('p', { className: 'reason' }, [person.reason]),
          isTop && this.#actions(person),
        ]),
      ],
    );

    if (isTop) {
      // The picture and the name open the profile through the site's own link, so the visit is the site's own.
      for (const target of [picture, name]) {
        target.addEventListener('click', (event) => {
          event.preventDefault();

          if (this.#drag === null || !this.#drag.isDragging) {
            person.link.click();
          }
        });
      }

      picture.setAttribute('role', 'link');
      picture.setAttribute('aria-label', `${person.name}'s profile`);
    } else {
      card.inert = true;
    }

    return card;
  }

  #actions(person: Suggestion): HTMLElement {
    const follow = el(
      'button',
      {
        className: person.isFollowing ? 'follow following' : 'follow',
        attrs: {
          type: 'button',
          'aria-label': person.isFollowing
            ? `Unfollow @${person.username}`
            : `Follow @${person.username}${person.followsYou ? ' back' : ''}`,
          'aria-pressed': String(person.isFollowing),
        },
      },
      [
        createSvgIcon(person.isFollowing ? ICONS.following : ICONS.follow, ''),
        person.isFollowing ? 'Following' : person.followsYou ? 'Follow back' : 'Follow',
      ],
    );

    follow.addEventListener('click', () => {
      person.follow.click();
    });

    const dismiss = el(
      'button',
      {
        className: 'dismiss',
        attrs: {
          type: 'button',
          'aria-label': person.isFollowing
            ? `Next. @${person.username} stays followed.`
            : `Not interested. @${person.username} won't be suggested again.`,
          title: person.isFollowing ? 'Next' : 'Not interested',
        },
      },
      [createSvgIcon(CLOSE_ICON, '')],
    );

    dismiss.addEventListener('click', () => {
      this.#swipeAway('left');
    });

    return el('div', { className: 'actions' }, [dismiss, follow]);
  }

  #top(): HTMLElement | null {
    return this.#stage.querySelector('.card[data-depth="0"]');
  }

  /**
   * The top card goes off the way it was sent. For someone suggested, that is the row's own "Not interested", pressed
   * at once so the site brings in someone new while the card is still leaving; they join at the back. Someone you
   * follow just goes to the back.
   */
  #swipeAway(towards: Direction, from = 0): void {
    const person = this.#people[0];

    if (person === undefined || this.#isMoving) {
      return;
    }

    if (!person.isFollowing && person.dismiss !== null) {
      person.dismiss.click();
    }

    const settle = (): void => {
      // Gone from the rows, they leave the stack with the next update; still there, they go to the back.
      this.#order = [...this.#order.filter((username) => username !== person.username), person.username];
      this.#people = [...this.#people.filter((other) => other !== person), person];
      this.#isMoving = false;
      this.#draw();
    };
    const top = this.#top();

    if (top === null || prefersReducedMotion()) {
      settle();

      return;
    }

    this.#isMoving = true;

    const away = (towards === 'left' ? -1 : 1) * (top.offsetWidth * 1.3);

    top
      .animate(
        [
          { transform: `translateX(${String(from)}px) rotate(${String(from / 20)}deg)` },
          { transform: `translateX(${String(away)}px) rotate(${String(away / 20)}deg)`, opacity: 0 },
        ],
        { duration: 260, easing: 'cubic-bezier(0.3, 0, 0.6, 1)', fill: 'forwards' },
      )
      .finished.then(settle, settle);
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    const top = this.#top();

    if (
      event.button !== 0 ||
      !event.isPrimary ||
      this.#isMoving ||
      top === null ||
      !(event.target instanceof Element) ||
      !top.contains(event.target) ||
      event.target.closest('button') !== null
    ) {
      return;
    }

    this.#drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: 0,
      samples: [{ x: event.clientX, time: event.timeStamp }],
      isDragging: false,
    };
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    const top = this.#top();

    if (drag === null || top === null || event.pointerId !== drag.pointerId) {
      return;
    }

    const dx = event.clientX - drag.startX;

    if (!drag.isDragging) {
      if (Math.abs(event.clientY - drag.startY) > SLOP_PX && Math.abs(dx) < SLOP_PX) {
        // Moving up or down: the page is being scrolled, not the card.
        this.#drag = null;

        return;
      }

      if (Math.abs(dx) < SLOP_PX) {
        return;
      }

      drag.isDragging = true;
      this.#stage.setPointerCapture(event.pointerId);
      top.classList.add('dragging');
    }

    drag.x = dx;
    drag.samples = [
      ...drag.samples.filter((sample) => event.timeStamp - sample.time < 100),
      { x: event.clientX, time: event.timeStamp },
    ];
    top.style.transform = `translateX(${String(dx)}px) rotate(${String(dx / 20)}deg)`;
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    const top = this.#top();

    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    // Cleared after the click this press ends in, which must not open the profile after a drag.
    setTimeout(() => {
      if (this.#drag === drag) {
        this.#drag = null;
      }
    });

    if (!drag.isDragging || top === null) {
      return;
    }

    top.classList.remove('dragging');

    const [first = { x: event.clientX, time: event.timeStamp }] = drag.samples;
    const speed = (event.clientX - first.x) / Math.max(event.timeStamp - first.time, 1);
    const isGoing = Math.abs(drag.x) > top.offsetWidth * SWIPE_SHARE || Math.abs(speed) > FLICK_SPEED;

    top.style.transform = '';

    if (isGoing) {
      this.#swipeAway(drag.x < 0 ? 'left' : 'right', drag.x);

      return;
    }

    if (!prefersReducedMotion()) {
      top.animate(
        [{ transform: `translateX(${String(drag.x)}px) rotate(${String(drag.x / 20)}deg)` }, { transform: 'none' }],
        { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1.2)' },
      );
    }
  };
}

export interface WhoToFollowCardsOptions {
  enabled: () => boolean;
  signal: AbortSignal;
}

/**
 * Turns each "Who to follow" block into a stack of swipeable cards. The site's rows stay where they are, hidden, and
 * the cards follow them: whatever the rows show, the cards show.
 */
export class WhoToFollowCards {
  readonly #enabled: () => boolean;
  readonly #decks = new Map<Element, Deck>();
  readonly #observer: MutationObserver;
  #frame = 0;

  constructor({ enabled, signal }: WhoToFollowCardsOptions) {
    this.#enabled = enabled;
    // A follow only changes a button's label, which the page-wide watch for added and removed nodes does not see.
    this.#observer = new MutationObserver(this.#schedule);

    for (const stray of document.querySelectorAll(`${ownedSelector(CARDS_ROLE)}, ${ownedSelector(STYLE_ROLE)}`)) {
      stray.remove();
    }

    signal.addEventListener(
      'abort',
      () => {
        this.destroy();
      },
      { once: true },
    );
  }

  /** Puts the cards in place over every block on the page, or takes them away when the feature is off. */
  ensure(): void {
    if (!this.#enabled()) {
      this.destroy();

      return;
    }

    const sections = [...document.querySelectorAll(WHO_TO_FOLLOW_SECTIONS)];

    for (const [section, deck] of this.#decks) {
      if (!sections.includes(section) || !section.isConnected) {
        deck.host.remove();
        this.#decks.delete(section);
      }
    }

    for (const section of sections) {
      const list = suggestionList(section);
      const people = list === null ? [] : readSuggestions(list);
      let deck = this.#decks.get(section);

      if (list === null || people.length === 0) {
        // Still loading, emptied, or hidden: the site says so in its own words.
        deck?.host.remove();

        continue;
      }

      if (deck === undefined) {
        deck = new Deck();
        this.#decks.set(section, deck);
        this.#observer.observe(section, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['aria-label', 'inert', 'src'],
        });
      }

      if (deck.host.previousElementSibling !== list) {
        list.after(deck.host);
      }

      deck.update(people);
    }

    if (this.#decks.size > 0 && document.head.querySelector(ownedSelector(STYLE_ROLE)) === null) {
      document.head.append(hideRowsStyle());
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#observer.disconnect();

    for (const deck of this.#decks.values()) {
      deck.host.remove();
    }

    this.#decks.clear();
    document.head.querySelector(ownedSelector(STYLE_ROLE))?.remove();
  }

  readonly #schedule = (): void => {
    if (this.#frame === 0) {
      this.#frame = requestAnimationFrame(() => {
        this.#frame = 0;
        this.ensure();
      });
    }
  };
}
