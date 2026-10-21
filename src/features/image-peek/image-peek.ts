import { el, markOwned, ownedSelector } from '@/core/dom';
import { isReadyToPeek, largerAvatar, peekCandidate } from '@/site/images';

import {
  drawnRect,
  frameAt,
  intersect,
  PEEK_MARGIN,
  peekRect,
  restingFrame,
  type ObjectFit,
  type PeekFrame,
  type Rect,
  type Size,
} from './geometry';

export const PEEK_ROLE = 'image-peek';

/** A press shorter than this is a click, and nothing about it changes. */
export const PEEK_DELAY_MS = 150;
/** How long the image takes to grow out and settle. */
export const GROW_MS = 340;
/** How long it takes to go back. Quicker than growing: letting go should feel immediate. */
export const RETURN_MS = 240;
/** How long a held press waits for a picture that is still loading. */
const LOAD_WAIT_MS = 4_000;
/** How much faster a grow cut short retraces its path back. */
const REVERSE_SPEED = 1.6;
/** A pointer that wanders further than this before the peek is selecting text or dragging, not holding. */
const SLOP_PX = 8;
/** The overshoot at the end of the grow, the "pop". */
const POP_SCALE = 1.025;
/** The peek's own rounded corners at rest. */
const PEEK_RADIUS = 12;
/** How long after a peek the click it ends in is still recognised, and swallowed. */
const SWALLOW_MS = 3_000;
/** The most an avatar grows to, across: big enough to see the face, not a wall of pixels. */
const AVATAR_PEEK_PX = 480;
/** How long the larger picture takes to fade in over the smaller one. */
const SHARPEN_MS = 180;

const CSS = `
  :host { all: initial; position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; contain: strict; }
  .backdrop { position: absolute; inset: 0; background: rgb(0 0 0 / 0.6); opacity: 0; will-change: opacity; }
  .copy { position: absolute; transform-origin: 0 0; will-change: transform, clip-path; }
  img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    max-width: none;
    user-select: none;
    -webkit-user-drag: none;
  }
`;

/**
 * A larger copy of the picture, asked for as the press begins: the peek grows to its size straight away, showing the
 * picture already on the page, and the larger one fades in over it once it has arrived.
 */
interface Larger {
  picture: HTMLImageElement;
  /** The size the peek is laid out for, in CSS pixels. */
  natural: Size;
}

/** For a GitHub avatar, the same avatar at the size the peek will show it, on this screen; for anything else, `null`. */
function askForLarger(image: HTMLImageElement): Larger | null {
  const room = Math.min(window.innerWidth, window.innerHeight) * (1 - 2 * PEEK_MARGIN);
  const across = Math.min(room, AVATAR_PEEK_PX);
  const src = largerAvatar(image.currentSrc || image.src, across * window.devicePixelRatio);

  if (src === null) {
    return null;
  }

  const picture = new Image();
  const shape = image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalHeight / image.naturalWidth : 1;

  picture.referrerPolicy = 'no-referrer';
  picture.src = src;

  return { picture, natural: { width: across, height: across * shape } };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function toRect(rect: DOMRect): Rect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * The rounded corners the picture shows on the page. The site rounds a grid of images on the grid, not on each image,
 * so the nearest clipping ancestor with rounded corners counts too.
 */
function roundedCorners(image: HTMLImageElement): number {
  let element: Element | null = image;

  for (let depth = 0; element !== null && depth < 4; depth++, element = element.parentElement) {
    const style = getComputedStyle(element);
    const radius = Number.parseFloat(style.borderTopLeftRadius);

    if (radius > 0 && (element === image || style.overflow !== 'visible')) {
      return radius;
    }
  }

  return 0;
}

/** Where the picture is on the page now, as the peek must look to sit exactly on top of it. */
function sourceFrame(image: HTMLImageElement, peek: Rect): PeekFrame | null {
  if (!image.isConnected) {
    return null;
  }

  const box = toRect(image.getBoundingClientRect());
  const style = getComputedStyle(image);
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  const drawn = drawnRect(box, natural, style.objectFit as ObjectFit, style.objectPosition);
  const visible = intersect(drawn, box);

  return visible === null ? null : frameAt(peek, drawn, visible, roundedCorners(image));
}

/** The pop: a touch larger than at rest, around the centre. */
function popFrame(peek: Rect): PeekFrame {
  const dx = ((POP_SCALE - 1) * peek.width) / 2;
  const dy = ((POP_SCALE - 1) * peek.height) / 2;

  return {
    transform: `translate(${String(-dx)}px, ${String(-dy)}px) scale(${String(POP_SCALE)}, ${String(POP_SCALE)})`,
    clipPath: restingFrame(PEEK_RADIUS / POP_SCALE).clipPath,
  };
}

/**
 * One peek at one image: a copy of it lifts off the page, grows to fill the screen and pops, then, when let go, goes
 * back exactly where it came from. The page's own image is only hidden with an animation while the copy is out, so
 * nothing the site renders is ever changed.
 */
class Peek {
  readonly #image: HTMLImageElement;
  readonly #host: HTMLElement;
  readonly #backdrop: HTMLElement;
  /** What moves: a frame holding the copy of the picture, and the larger one once it is in. */
  readonly #copy: HTMLElement;
  readonly #rect: Rect;
  readonly #onGone: () => void;
  #hiding: Animation | null = null;
  #moving: Animation[] = [];
  #state: 'growing' | 'shown' | 'returning' | 'gone' = 'growing';
  #backstop = 0;

  constructor(image: HTMLImageElement, onGone: () => void, larger: Larger | null = null) {
    this.#image = image;
    this.#onGone = onGone;

    const natural = larger?.natural ?? { width: image.naturalWidth, height: image.naturalHeight };
    const shown = image.getBoundingClientRect();
    const isLargerIn = larger !== null && larger.picture.complete && larger.picture.naturalWidth > 0;
    const picture = el('img', { attrs: { alt: image.alt, decoding: 'sync', draggable: 'false' } });

    // Already in, from this press's head start or an earlier peek, the larger picture shows from the first frame.
    picture.src = isLargerIn ? larger.picture.src : image.currentSrc || image.src;
    this.#rect = peekRect({ width: window.innerWidth, height: window.innerHeight }, natural, shown);
    this.#backdrop = el('div', { className: 'backdrop' });
    this.#copy = el('div', { className: 'copy' }, [picture]);
    Object.assign(this.#copy.style, {
      left: `${String(this.#rect.left)}px`,
      top: `${String(this.#rect.top)}px`,
      width: `${String(this.#rect.width)}px`,
      height: `${String(this.#rect.height)}px`,
    });
    this.#host = el('div', { attrs: { 'aria-hidden': 'true' } });
    markOwned(this.#host, PEEK_ROLE);
    this.#host.attachShadow({ mode: 'open' }).append(el('style', {}, [CSS]), this.#backdrop, this.#copy);

    if (larger !== null && !isLargerIn) {
      larger.picture.decode().then(
        () => {
          this.#sharpen(larger.picture.src);
        },
        () => undefined,
      );
    }
  }

  get image(): HTMLImageElement {
    return this.#image;
  }

  grow(): void {
    const from = sourceFrame(this.#image, this.#rect);

    if (from === null) {
      this.#finish();

      return;
    }

    document.documentElement.append(this.#host);
    // The copy now covers the picture exactly; hide the picture underneath in the same frame, so it seems to lift off.
    this.#hiding = this.#image.animate([{ opacity: 0 }], { duration: 0, fill: 'forwards' });

    const rest = restingFrame(PEEK_RADIUS);

    if (prefersReducedMotion()) {
      // No movement: it simply fades in at full size.
      this.#moving = [
        this.#copy.animate(
          [
            { ...rest, opacity: 0 },
            { ...rest, opacity: 1 },
          ],
          { duration: 150, fill: 'forwards' },
        ),
        this.#backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, fill: 'forwards' }),
      ];
    } else {
      this.#moving = [
        this.#copy.animate(
          [
            { ...from, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
            { ...popFrame(this.#rect), offset: 0.78, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
            rest,
          ],
          { duration: GROW_MS, fill: 'forwards' },
        ),
        this.#backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: GROW_MS * 0.8, fill: 'forwards' }),
      ];
    }

    this.#whenMoved(GROW_MS, () => {
      if (this.#state === 'growing') {
        this.#state = 'shown';
      }
    });
  }

  /** Let go: back to exactly where the picture is now, then gone. */
  release(): void {
    if (this.#state === 'returning' || this.#state === 'gone') {
      return;
    }

    const wasGrowing = this.#state === 'growing';

    this.#state = 'returning';

    if (wasGrowing && !prefersReducedMotion()) {
      // Still on its way out: retrace the same path back, a little faster.
      const elapsed = Number(this.#moving[0]?.currentTime ?? GROW_MS);

      for (const animation of this.#moving) {
        animation.updatePlaybackRate(-REVERSE_SPEED);
      }

      this.#whenMoved(elapsed / REVERSE_SPEED, () => {
        this.#finish();
      });

      return;
    }

    const to = sourceFrame(this.#image, this.#rect);

    this.#stopMoving();

    if (to === null || prefersReducedMotion()) {
      // The picture is gone from the page, or motion is unwelcome: fade out where it is.
      this.#moving = [
        this.#copy.animate(
          [
            { ...restingFrame(PEEK_RADIUS), opacity: 1 },
            { ...restingFrame(PEEK_RADIUS), opacity: 0 },
          ],
          {
            duration: 150,
            fill: 'forwards',
          },
        ),
        this.#backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }),
      ];
    } else {
      this.#moving = [
        this.#copy.animate([restingFrame(PEEK_RADIUS), to], {
          duration: RETURN_MS,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'forwards',
        }),
        this.#backdrop.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: RETURN_MS,
          easing: 'ease-out',
          fill: 'forwards',
        }),
      ];
    }

    this.#whenMoved(RETURN_MS, () => {
      this.#finish();
    });
  }

  /** Gone at once, with the page exactly as it was. */
  destroy(): void {
    this.#finish();
  }

  /**
   * The larger picture has arrived: it fades in over the smaller one, in the same place and at the same size, wherever
   * the peek is in its flight, so the picture only gets sharper.
   */
  #sharpen(src: string): void {
    if (this.#state === 'gone') {
      return;
    }

    const sharp = el('img', {
      attrs: { alt: '', decoding: 'sync', draggable: 'false', referrerpolicy: 'no-referrer' },
    });

    sharp.src = src;
    sharp.decode().then(
      () => {
        if (this.#state === 'gone') {
          return;
        }

        this.#copy.append(sharp);

        if (!prefersReducedMotion()) {
          sharp.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SHARPEN_MS, easing: 'ease-out' });
        }
      },
      () => undefined,
    );
  }

  /** Runs `then` when the current animations finish, or after `ms` in case they never report back. */
  #whenMoved(ms: number, then: () => void): void {
    const moving = this.#moving;
    let done = false;
    const once = (): void => {
      if (!done && this.#moving === moving) {
        done = true;
        clearTimeout(this.#backstop);
        then();
      }
    };

    clearTimeout(this.#backstop);
    void Promise.all(moving.map(async (animation) => animation.finished)).then(once, () => undefined);
    this.#backstop = window.setTimeout(once, ms + 120);
  }

  #stopMoving(): void {
    for (const animation of this.#moving) {
      animation.finished.catch(() => undefined);
    }

    // Each new animation starts from where the last one is, so the old ones are cancelled only once replaced.
    const old = this.#moving;

    queueMicrotask(() => {
      for (const animation of old) {
        animation.cancel();
      }
    });
  }

  #finish(): void {
    if (this.#state === 'gone') {
      return;
    }

    this.#state = 'gone';
    clearTimeout(this.#backstop);
    // Show the picture again and take the copy away in the same frame, so there is never a gap or a double.
    for (const animation of [...this.#moving, ...(this.#hiding === null ? [] : [this.#hiding])]) {
      // Cancelling rejects `finished`; that is expected here.
      animation.finished.catch(() => undefined);
      animation.cancel();
    }

    this.#host.remove();

    this.#onGone();
  }
}

export interface ImagePeekOptions {
  /** Whether pressing should do anything right now, read at each press. */
  enabled: () => boolean;
  signal: AbortSignal;
}

interface Press {
  image: HTMLImageElement;
  x: number;
  y: number;
  pointerId: number;
  timer: number;
  /** Set while held on a picture that is still loading. */
  waiting: AbortController | null;
  /** A larger copy of the picture, on its way, for an avatar. */
  larger: Larger | null;
}

/**
 * Press and hold an image to peek at it: it grows out of the page and pops, and goes back exactly where it was when
 * let go. A quick click does what it always did, such as opening the site's own photo viewer; only the click a peek
 * ends in is swallowed.
 *
 * Moving, scrolling or dragging before the peek starts cancels quietly. While it is out, the page does not scroll
 * under it, and Escape, switching away or losing the pointer all send it back.
 */
export class ImagePeek {
  readonly #enabled: () => boolean;
  #press: Press | null = null;
  #peek: Peek | null = null;
  #swallow: { target: Element; until: number } | null = null;

  constructor({ enabled, signal }: ImagePeekOptions) {
    this.#enabled = enabled;

    for (const stray of document.querySelectorAll(ownedSelector(PEEK_ROLE))) {
      stray.remove();
    }

    const listen = { capture: true, signal };

    window.addEventListener('pointerdown', this.#onPointerDown, listen);
    window.addEventListener('pointermove', this.#onPointerMove, { ...listen, passive: true });
    window.addEventListener('pointerup', this.#release, listen);
    window.addEventListener('pointercancel', this.#release, listen);
    // Not captured: a captured `blur` also hears every element on the page losing focus, as one does whenever a press
    // moves focus to the image's link. Only the window itself losing focus sends the image back.
    window.addEventListener('blur', this.#onWindowBlur, { signal });
    window.addEventListener('scroll', this.#onScroll, { ...listen, passive: true });
    window.addEventListener('wheel', this.#onWheel, { ...listen, passive: false });
    window.addEventListener('keydown', this.#onKeyDown, listen);
    window.addEventListener('dragstart', this.#onDragStart, listen);
    window.addEventListener('contextmenu', this.#onContextMenu, listen);
    window.addEventListener('click', this.#onClick, listen);
    document.addEventListener('visibilitychange', this.#release, { signal });
    signal.addEventListener(
      'abort',
      () => {
        this.destroy();
      },
      { once: true },
    );
  }

  /** Whether an image is out right now. */
  get isPeeking(): boolean {
    return this.#peek !== null;
  }

  destroy(): void {
    this.#cancelPress();
    this.#peek?.destroy();
    this.#peek = null;
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    this.#cancelPress();

    if (
      this.#peek !== null ||
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

    const image = peekCandidate(event.target);

    if (image === null) {
      return;
    }

    // Decode the picture now, during the wait, so the peek's first frame is never blank.
    void image.decode().catch(() => undefined);
    this.#press = {
      image,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      timer: window.setTimeout(this.#startPeek, PEEK_DELAY_MS),
      waiting: null,
      // Asked for now, so the wait before the peek is a head start on loading it.
      larger: askForLarger(image),
    };
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    const press = this.#press;

    if (press !== null && event.pointerId === press.pointerId) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX) {
        this.#cancelPress();
      }
    }
  };

  readonly #startPeek = (): void => {
    const press = this.#press;

    if (press === null) {
      return;
    }

    if (!isReadyToPeek(press.image)) {
      if (press.image.complete || press.waiting !== null) {
        // It arrived, but failed or is only an icon: let the press be an ordinary one.
        this.#cancelPress();
      } else {
        this.#swallowClickOn(press.image);
        this.#waitForPicture(press);
      }

      return;
    }

    this.#press = null;
    press.waiting?.abort();
    this.#swallowClickOn(press.image);

    const peek = new Peek(
      press.image,
      () => {
        if (this.#peek === peek) {
          this.#peek = null;
        }
      },
      press.larger,
    );

    this.#peek = peek;
    peek.grow();
  };

  /** Held past a click: the click the release ends in lands on the picture, or its link, and must not also open it. */
  #swallowClickOn(image: HTMLImageElement): void {
    this.#swallow = { target: image.closest('a, button') ?? image, until: performance.now() + SWALLOW_MS };
  }

  /**
   * The picture was scrolled to a moment ago and has not arrived yet. While the press is held, the peek starts as soon
   * as it does; one that fails, or turns out to be an icon, is let go quietly.
   */
  #waitForPicture(press: Press): void {
    const waiting = new AbortController();
    const settle = (): void => {
      waiting.abort();

      if (this.#press === press) {
        if (isReadyToPeek(press.image)) {
          this.#startPeek();
        } else {
          this.#cancelPress();
        }
      }
    };

    press.waiting = waiting;
    press.image.addEventListener('load', settle, { once: true, signal: waiting.signal });
    press.image.addEventListener('error', settle, { once: true, signal: waiting.signal });
    press.timer = window.setTimeout(settle, LOAD_WAIT_MS);
  }

  readonly #release = (): void => {
    this.#cancelPress();
    this.#peek?.release();
  };

  readonly #onWindowBlur = (event: FocusEvent): void => {
    // An element losing focus targets that element; the window losing focus targets the window.
    if (!(event.target instanceof Node)) {
      this.#release();
    }
  };

  readonly #onScroll = (): void => {
    // Scrolling before the peek means the press was the start of a scroll.
    this.#cancelPress();
  };

  readonly #onWheel = (event: WheelEvent): void => {
    // While the image is out, the page stays still under it, so it can go back to the same place.
    if (this.#peek !== null) {
      event.preventDefault();
    }
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.#peek !== null) {
      event.preventDefault();
      event.stopPropagation();
      this.#release();
    }
  };

  readonly #onDragStart = (event: DragEvent): void => {
    if (this.#peek !== null || this.#swallowing()) {
      // The picture is out; it must not be dragged away as well.
      event.preventDefault();
    } else {
      this.#cancelPress();
    }
  };

  readonly #onContextMenu = (event: Event): void => {
    // On touch screens a long press also asks for the context menu. Once a peek is out, that menu is noise.
    if (this.#peek !== null || this.#swallowing()) {
      event.preventDefault();
    }
  };

  readonly #onClick = (event: MouseEvent): void => {
    const swallow = this.#swallow;

    if (swallow === null) {
      return;
    }

    this.#swallow = null;

    if (performance.now() < swallow.until && event.target instanceof Node && swallow.target.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  #cancelPress(): void {
    if (this.#press !== null) {
      clearTimeout(this.#press.timer);
      this.#press.waiting?.abort();
      this.#press = null;
    }
  }

  #swallowing(): boolean {
    return this.#swallow !== null && performance.now() < this.#swallow.until;
  }
}
