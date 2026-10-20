import { previewableLink } from '@/site/links';

/** A press shorter than this is a click, and nothing about it changes. */
export const GROW_DELAY_MS = 150;
/** How long the preview takes to grow to full size under a held pointer. */
export const GROW_MS = 450;
/** How long a press must last to open a preview. */
export const HOLD_MS = GROW_DELAY_MS + GROW_MS;
/** A pointer that wanders further than this is selecting text or dragging, not holding. */
const SLOP_PX = 8;
/** How long after a hold the click it ends in is still recognised, and swallowed. */
const SWALLOW_MS = 3_000;

export interface LongPressOptions {
  /** Whether pressing should do anything right now, read at each press. */
  enabled: () => boolean;
  /** The hold has lasted past a click: start growing the preview. */
  onGrow: (url: URL, origin: { x: number; y: number }, duration: number) => void;
  /** Let go, or moved away, before the preview was full size. */
  onCancel: () => void;
  /** Held long enough: the preview stays. */
  onCommit: () => void;
  signal: AbortSignal;
}

interface Press {
  link: HTMLAnchorElement;
  url: URL;
  x: number;
  y: number;
  pointerId: number;
  timer: number;
  growing: boolean;
}

/**
 * Turns a press-and-hold on a previewable link into a preview that grows out of it, and leaves every ordinary click
 * alone.
 *
 * - A quick click opens the link as usual: nothing happens until {@link GROW_DELAY_MS}.
 * - Holding past that grows the preview under the pointer. Letting go, or moving away, before it is full size shrinks
 *   it back, and the link does not open either: the hold was a change of mind, not a click.
 * - Holding for {@link HOLD_MS} keeps the preview open.
 *
 * Moving, scrolling or dragging before the preview starts growing cancels quietly, so selecting text and dragging the
 * link work as before.
 */
export class LinkLongPress {
  readonly #options: LongPressOptions;
  #press: Press | null = null;
  /** The link whose next click is swallowed, because a hold on it grew a preview. */
  #swallow: { link: HTMLAnchorElement; until: number } | null = null;

  constructor(options: LongPressOptions) {
    this.#options = options;

    const listen = { capture: true, signal: options.signal };

    window.addEventListener('pointerdown', this.#onPointerDown, listen);
    window.addEventListener('pointermove', this.#onPointerMove, { ...listen, passive: true });
    window.addEventListener('pointerup', this.#end, listen);
    window.addEventListener('pointercancel', this.#end, listen);
    window.addEventListener('scroll', this.#onScroll, { ...listen, passive: true });
    window.addEventListener('dragstart', this.#onDragStart, listen);
    window.addEventListener('contextmenu', this.#onContextMenu, listen);
    window.addEventListener('click', this.#onClick, listen);
    options.signal.addEventListener(
      'abort',
      () => {
        this.#end();
      },
      { once: true },
    );
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    this.#end();

    if (
      !event.isPrimary ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !this.#options.enabled()
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
      timer: window.setTimeout(this.#startGrowing, GROW_DELAY_MS),
      growing: false,
    };
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    const press = this.#press;

    if (press !== null && event.pointerId === press.pointerId) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX) {
        this.#end();
      }
    }
  };

  readonly #onScroll = (): void => {
    // Scrolling means the press was the start of a scroll. Once the preview grows the page is held still, and locking
    // it can itself report a scroll, which must not cancel the hold.
    if (this.#press?.growing === false) {
      this.#end();
    }
  };

  readonly #onDragStart = (event: DragEvent): void => {
    if (this.#press?.growing === true || this.#swallowing()) {
      // A preview is growing or has opened from this link; it must not be dragged away as well.
      event.preventDefault();
    }

    if (this.#press?.growing === false) {
      this.#end();
    }
  };

  readonly #onContextMenu = (event: Event): void => {
    // On touch screens a long press also asks for the context menu. Once a preview is growing, that menu is noise.
    if (this.#press?.growing === true || this.#swallowing()) {
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

  readonly #startGrowing = (): void => {
    const press = this.#press;

    if (press === null) {
      return;
    }

    press.growing = true;
    // From here on, letting go must not open the link: the click the release ends in is swallowed.
    this.#swallow = { link: press.link, until: performance.now() + SWALLOW_MS };
    press.timer = window.setTimeout(this.#commit, GROW_MS);
    this.#options.onGrow(press.url, { x: press.x, y: press.y }, GROW_MS);
  };

  readonly #commit = (): void => {
    if (this.#press === null) {
      return;
    }

    this.#press = null;
    this.#options.onCommit();
  };

  /** Ends a press early: quietly before the preview grows, by shrinking it back after. */
  readonly #end = (): void => {
    const press = this.#press;

    if (press === null) {
      return;
    }

    this.#press = null;
    clearTimeout(press.timer);

    if (press.growing) {
      this.#options.onCancel();
    }
  };

  #swallowing(): boolean {
    return this.#swallow !== null && performance.now() < this.#swallow.until;
  }
}
