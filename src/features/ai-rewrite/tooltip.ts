import { el, markOwned, ownedSelector } from '@/core/dom';

import styles from './tooltip.css?inline';

export const TOOLTIP_ROLE = 'tooltip';

/** Radix's gap: the content's `sideOffset` (4px) plus the arrow's height (5px). */
const GAP = 9;
/** How close to the window's edge the tooltip may sit before it is pushed back in. */
const EDGE = 8;

let tooltipCount = 0;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A tooltip that looks and behaves like the site's own (a Radix tooltip): it shows straight away on hover or keyboard
 * focus, sits centred above its trigger with an arrow, flips below when there is no room, and hides on leave, blur,
 * press or Escape. The site's toolbar buttons use theirs, so ours does too, instead of the browser's native `title`.
 *
 * It lives on <body>, outside React, in a shadow root that reads the site's theme tokens.
 */
export class SiteTooltip {
  readonly #trigger: HTMLElement;
  readonly #label: () => string;
  readonly #host: HTMLElement;
  readonly #text: HTMLElement;
  readonly #tip: HTMLElement;
  readonly #id = `dnpp-tooltip-${String(++tooltipCount)}`;
  readonly #controller = new AbortController();

  /**
   * @param trigger What the pointer and focus land on. For the toolbar that is the wrapper around our button.
   * @param describes The button itself: announced as described by the tooltip, and what it is positioned against,
   * since a wrapper may not hug the button it holds.
   * @param label The tooltip's text, read each time it shows, so it can follow the button's state.
   */
  constructor(trigger: HTMLElement, describes: HTMLElement, label: () => string) {
    this.#trigger = trigger;
    this.#label = label;
    this.#text = el('span');
    this.#tip = el('div', { className: 'tip' }, [
      this.#text,
      el('span', { className: 'arrow', attrs: { 'aria-hidden': 'true' } }),
    ]);
    this.#host = el('div', { attrs: { id: this.#id, role: 'tooltip' } });
    markOwned(this.#host, TOOLTIP_ROLE);
    this.#host.attachShadow({ mode: 'open' }).append(el('style', {}, [styles]), this.#tip);

    const signal = this.#controller.signal;
    const show = (): void => {
      this.#show(describes);
    };
    const hide = (): void => {
      this.hide(describes);
    };

    trigger.addEventListener('pointerenter', show, { signal });
    trigger.addEventListener('pointerleave', hide, { signal });
    trigger.addEventListener('focusin', show, { signal });
    trigger.addEventListener('focusout', hide, { signal });
    trigger.addEventListener('pointerdown', hide, { signal });
    trigger.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          hide();
        }
      },
      { signal },
    );
    // A tooltip left floating while the page moves would point at nothing.
    window.addEventListener('scroll', hide, { signal, capture: true, passive: true });
    window.addEventListener('resize', hide, { signal });
  }

  get isOpen(): boolean {
    return this.#host.isConnected;
  }

  /** The element shown while open, for tests. */
  get element(): HTMLElement {
    return this.#host;
  }

  hide(describes?: HTMLElement): void {
    describes?.removeAttribute('aria-describedby');
    this.#host.remove();
  }

  destroy(): void {
    this.#controller.abort();
    this.#host.remove();
  }

  #show(describes: HTMLElement): void {
    if (!this.#trigger.isConnected) {
      return;
    }

    // Only one of ours at a time, as with the site's.
    for (const other of document.querySelectorAll(ownedSelector(TOOLTIP_ROLE))) {
      if (other !== this.#host) {
        other.remove();
      }
    }

    this.#text.textContent = this.#label();
    this.#host.style.visibility = 'hidden';
    document.body.append(this.#host);

    const trigger = describes.getBoundingClientRect();
    const tip = this.#host.getBoundingClientRect();
    const fitsAbove = trigger.top - GAP - tip.height >= EDGE;
    const side = fitsAbove ? 'top' : 'bottom';
    const left = Math.min(
      Math.max(trigger.left + trigger.width / 2 - tip.width / 2, EDGE),
      window.innerWidth - tip.width - EDGE,
    );
    const top = fitsAbove ? trigger.top - GAP - tip.height : trigger.bottom + GAP;

    this.#host.dataset.side = side;
    this.#host.style.transform = `translate(${String(Math.round(left))}px, ${String(Math.round(top))}px)`;
    this.#host.style.visibility = '';
    describes.setAttribute('aria-describedby', this.#id);

    if (!prefersReducedMotion()) {
      // The site's enter: fade in, zoom from 95%, and slide 8px towards the trigger, over 150ms.
      const slide = side === 'top' ? '0.5rem' : '-0.5rem';

      this.#tip.animate(
        [
          { opacity: 0, transform: `translateY(${slide}) scale(0.95)` },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 150, easing: 'ease-out' },
      );
    }
  }
}
