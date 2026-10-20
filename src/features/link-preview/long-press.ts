import { el, markOwned } from '@/core/dom';
import { previewableLink } from '@/site/links';

export const RING_ROLE = 'link-preview-ring';

/** How long a press must last to open a preview. Long enough that an ordinary click never does. */
export const HOLD_MS = 500;
/** The ring only shows once a press is clearly not a click, so quick clicks never flash it. */
const RING_DELAY_MS = 120;
/** A pointer that wanders further than this is selecting text or dragging, not holding. */
const SLOP_PX = 6;

const RING_CSS = `
  :host { position: fixed; z-index: 2147483646; top: 0; left: 0; pointer-events: none; }
  svg { width: 40px; height: 40px; transform: translate(-50%, -50%) rotate(-90deg); overflow: visible; }
  .track { stroke: color-mix(in srgb, var(--primary, #3b6fe0) 25%, transparent); }
  .fill { stroke: var(--primary, #3b6fe0); stroke-linecap: round; }
`;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface LongPressOptions {
  /** Whether pressing should do anything right now, read at each press. */
  enabled: () => boolean;
  onOpen: (url: URL, origin: { x: number; y: number }) => void;
  signal: AbortSignal;
}

interface Press {
  link: HTMLAnchorElement;
  url: URL;
  x: number;
  y: number;
  pointerId: number;
  timer: number;
  ringTimer: number;
}

/**
 * Turns a press-and-hold on an outside link into a preview, and leaves every ordinary click alone.
 *
 * A press that lasts {@link HOLD_MS} without moving opens the preview, with a ring filling around the pointer as it
 * goes. Letting go early, moving, scrolling or starting a drag cancels it, so clicks, text selection and dragging the
 * link work as before. Only when a preview opens is the click that follows the release swallowed, so the link does not
 * also open in a new tab.
 */
export class LinkLongPress {
  readonly #enabled: () => boolean;
  readonly #onOpen: LongPressOptions['onOpen'];
  readonly #ring: HTMLElement;
  readonly #arc: SVGCircleElement;
  #press: Press | null = null;
  /** The link whose next click is swallowed, because holding it opened a preview. */
  #swallow: { link: HTMLAnchorElement; until: number } | null = null;
  #fill: Animation | null = null;

  constructor({ enabled, onOpen, signal }: LongPressOptions) {
    this.#enabled = enabled;
    this.#onOpen = onOpen;

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const track = document.createElementNS(ns, 'circle');

    this.#arc = document.createElementNS(ns, 'circle');

    for (const [circle, className] of [
      [track, 'track'],
      [this.#arc, 'fill'],
    ] as const) {
      circle.setAttribute('class', className);
      circle.setAttribute('cx', '20');
      circle.setAttribute('cy', '20');
      circle.setAttribute('r', '15');
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke-width', '3');
      svg.append(circle);
    }

    svg.setAttribute('viewBox', '0 0 40 40');
    // The fill is drawn by moving the dash offset from a full circumference to nothing.
    this.#arc.setAttribute('stroke-dasharray', String(2 * Math.PI * 15));
    this.#ring = el('div', { attrs: { 'aria-hidden': 'true' } });
    markOwned(this.#ring, RING_ROLE);
    this.#ring.attachShadow({ mode: 'open' }).append(el('style', {}, [RING_CSS]), svg);

    const options = { capture: true, signal };

    window.addEventListener('pointerdown', this.#onPointerDown, options);
    window.addEventListener('pointermove', this.#onPointerMove, { ...options, passive: true });
    window.addEventListener('pointerup', this.#onPointerUp, options);
    window.addEventListener('pointercancel', this.#cancel, options);
    window.addEventListener('scroll', this.#cancel, { ...options, passive: true });
    window.addEventListener('dragstart', this.#onDragStart, options);
    window.addEventListener('contextmenu', this.#onContextMenu, options);
    window.addEventListener('click', this.#onClick, options);
    signal.addEventListener(
      'abort',
      () => {
        this.#cancel();
      },
      { once: true },
    );
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    this.#cancel();

    if (
      !event.isPrimary ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !this.#enabled()
    ) {
      return;
    }

    const target = previewableLink(event.target);

    if (target === null) {
      return;
    }

    this.#press = {
      ...target,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      timer: window.setTimeout(this.#complete, HOLD_MS),
      ringTimer: window.setTimeout(this.#showRing, RING_DELAY_MS),
    };
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    const press = this.#press;

    if (press !== null && event.pointerId === press.pointerId) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX) {
        this.#cancel();
      }
    }
  };

  readonly #onPointerUp = (): void => {
    // Released before the hold completed: an ordinary click, which goes ahead untouched.
    this.#cancel();
  };

  readonly #onDragStart = (event: DragEvent): void => {
    if (this.#press !== null && this.#swallow === null) {
      this.#cancel();
    } else if (this.#swallow !== null) {
      // The preview has opened; the link must not be dragged away as well.
      event.preventDefault();
    }
  };

  readonly #onContextMenu = (event: Event): void => {
    // On touch screens a long press also asks for the context menu. Once it has opened a preview, that menu is noise.
    if (this.#swallow !== null && performance.now() < this.#swallow.until) {
      event.preventDefault();
    }
  };

  readonly #onClick = (event: MouseEvent): void => {
    const swallow = this.#swallow;

    if (swallow === null) {
      return;
    }

    this.#swallow = null;

    if (performance.now() < swallow.until && event.target instanceof Node && swallow.link.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  readonly #showRing = (): void => {
    const press = this.#press;

    if (press === null) {
      return;
    }

    this.#ring.style.transform = `translate(${String(press.x)}px, ${String(press.y)}px)`;
    document.body.append(this.#ring);

    const circumference = 2 * Math.PI * 15;

    this.#fill = this.#arc.animate([{ strokeDashoffset: circumference }, { strokeDashoffset: 0 }], {
      duration: HOLD_MS - RING_DELAY_MS,
      easing: prefersReducedMotion() ? 'linear' : 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    });
  };

  readonly #complete = (): void => {
    const press = this.#press;

    if (press === null) {
      return;
    }

    this.#press = null;
    clearTimeout(press.ringTimer);
    this.#hideRing();
    // The release that follows ends in a click on the link; it must not also open the link in a new tab.
    this.#swallow = { link: press.link, until: performance.now() + 3_000 };
    this.#onOpen(press.url, { x: press.x, y: press.y });
  };

  readonly #cancel = (): void => {
    const press = this.#press;

    if (press === null) {
      return;
    }

    this.#press = null;
    clearTimeout(press.timer);
    clearTimeout(press.ringTimer);
    this.#hideRing();
  };

  #hideRing(): void {
    if (this.#fill !== null) {
      this.#fill.finished.catch(() => undefined);
      this.#fill.cancel();
      this.#fill = null;
    }

    this.#ring.remove();
  }
}
