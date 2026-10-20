import { createSvgIcon, el, markOwned } from '@/core/dom';
import { CLOSE_ICON } from '@/core/icons';
import { bottomBars, isShown, stickyHeaders } from '@/site/embeds';

import { createFrameLoop, type FrameLoop } from './frame-loop';
import {
  CEILING_GAP,
  CORNERS,
  DOCK_MARGIN,
  POP_OUT_BELOW,
  RESTING_VELOCITY,
  RETURN_ABOVE,
  afterEmbedLeft,
  carriedBy,
  ceilingOver,
  closeAction,
  cornerBox,
  departureBox,
  dockSize,
  floorUnder,
  isCompact,
  isSameBox,
  isSpringSettled,
  nearestCorner,
  oppositeCorner,
  resizedLength,
  returnsByItself,
  stepSpring,
  visibleFraction,
} from './geometry';
import type { Box, Ceiling, Corner, Obstacle, Placement, Point, Size } from './geometry';
import { readPlacement, writePlacement } from './placement';
import { canGoFullscreen, goFullscreen, playerApiSrc, watchPlayback, type Playback } from './playback';
import styles from './player.css?inline';

export const PLAYER_ROLE = 'pip-player';

/** Long enough for the page to restore its scroll after a visit, and for a list that re-renders a post to put it back. */
const SETTLE_MS = 150;
/** Frames further apart than this, like after the tab was in the background, move the spring no further than one. */
const LONGEST_FRAME = 1 / 20;
const FRAME = 1 / 60;
/** Resting in a corner, it checks now and then for anything that moved without saying so. */
const RESTING_CHECK_MS = 500;
/** How long the controls stay after the pointer leaves. */
const CONTROLS_DELAY_MS = 1_500;
/** Inline, it belongs under the site's sticky headers like the rest of the page. Floating, it sits above them, below toasts. */
const INLINE_LAYER = '1';
const FLOATING_LAYER = '999999990';

const MAXIMIZE_ICON = ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'] as const;

/** The video playing, and the frame the site would have played it in. */
export interface PlayingVideo {
  key: string;
  src: string;
  title: string;
  aspectRatio: number;
  /** The site's own frame attributes, copied so the provider sees exactly what it would have. */
  allow: string;
  sandbox: string | null;
  referrerPolicy: string;
  /** The path of the page it belongs to. A search narrowing its results keeps the video at home. */
  pagePath: string;
}

export interface PlayerOptions {
  video: PlayingVideo;
  /** The embed it was played from, where it starts. */
  slot: HTMLElement;
  isAutomatic: () => boolean;
  /** The embeds of this video on the page that can hold it, in page order. */
  slotsFor: (key: string) => HTMLElement[];
  /** It stopped and is gone. */
  onEnd: () => void;
  /** It started or stopped floating, or moved to another embed. */
  onChange: () => void;
}

type Stage = 'inline' | 'holding' | 'to-slot' | 'to-corner' | 'floating';

type Interaction =
  | { kind: 'drag'; offset: Point; samples: (Point & { time: number })[] }
  | { kind: 'resize'; anchor: Corner; start: Box; length: number };

/** What the player reads off the page, once a frame. */
interface Measured {
  viewport: Size;
  ceilings: Ceiling[];
  obstacles: Obstacle[];
}

function toBox(rect: DOMRect): Box {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The one playing video. It lives outside the site's page, in our own element, so a visit to another page never
 * touches it, and it is never moved in the DOM, which would reload the frame and restart the video: going between its
 * embed and a corner only changes how it is positioned.
 *
 * Its behaviour follows dev-null.sh pull request #686 (use-docked-player.ts):
 * - Inline, it lies over its embed and scrolls with the page.
 * - A playing video scrolled until under a quarter of it shows floats to a corner, and flies home once 60% shows.
 * - Popped out by hand, it is pinned: it stays out on every page until Play here or closing brings it back.
 * - Leaving the page, a playing video floats on; a paused one stops.
 * - Close hands it back to its embed if enough of that shows, and stops it otherwise.
 * It moves in animation frames only while in flight or waiting for the page to settle, and sleeps otherwise.
 */
export class Player {
  readonly #video: PlayingVideo;
  readonly #options: PlayerOptions;
  readonly #host: HTMLElement;
  readonly #frame: HTMLIFrameElement;
  readonly #loop: FrameLoop;
  readonly #cleanups: (() => void)[] = [];
  #stage: Stage = 'inline';
  #since = performance.now();
  #slot: HTMLElement | null = null;
  #home: HTMLElement | null = null;
  #candidate: HTMLElement | null = null;
  #candidateSince = 0;
  #box: Box = { x: 0, y: 0, width: 0, height: 0 };
  #lastSlotRect: Box = { x: 0, y: 0, width: 0, height: 0 };
  #lastTarget: Box | null = null;
  #velocity: Box = RESTING_VELOCITY;
  #lastFrame = performance.now();
  #placement: Placement;
  #isPlacementCompact: boolean;
  #interaction: Interaction | null = null;
  #isPinned = false;
  #hiddenSince: number | null = null;
  #playback: Playback = 'unknown';
  #isFloating = false;
  #measured: Measured | null = null;
  #controlsTimer = 0;
  #isEnded = false;

  constructor(options: PlayerOptions) {
    this.#options = options;
    this.#video = options.video;

    const viewport = this.#viewport();

    this.#placement = readPlacement(viewport);
    this.#isPlacementCompact = isCompact(viewport);
    this.#frame = this.#createFrame();
    this.#host = el('div');
    markOwned(this.#host, PLAYER_ROLE);
    this.#host
      .attachShadow({ mode: 'open' })
      .append(el('style', {}, [styles]), el('div', { className: 'surface' }, [this.#frame]), this.#createControls());
    this.#host.addEventListener('pointerenter', this.#showControls);
    this.#host.addEventListener('pointerleave', this.#scheduleHidingControls);
    // Keys pressed in the player's own controls must not reach the site's single-key shortcuts.
    this.#host.addEventListener('keydown', (event) => {
      event.stopPropagation();
    });
    document.documentElement.append(this.#host);

    this.#loop = createFrameLoop((now, isWaking) => {
      const seconds = isWaking ? FRAME : Math.min((now - this.#lastFrame) / 1000, LONGEST_FRAME);

      this.#lastFrame = now;

      if (this.#interaction !== null) {
        return false;
      }

      this.#measured = null;

      return this.#step(now, seconds);
    });
    this.#attach(options.slot);
    this.#watch();
  }

  get isFloating(): boolean {
    return this.#isFloating;
  }

  get isPinned(): boolean {
    return this.#isPinned;
  }

  get video(): PlayingVideo {
    return this.#video;
  }

  /** The embed it sits in, inline, or `null` while it floats or flies. */
  get heldSlot(): HTMLElement | null {
    return this.#stage === 'inline' ? this.#slot : null;
  }

  /** The embed it sits in or is flying into, or `null` while it floats or flies to a corner. */
  get slot(): HTMLElement | null {
    return this.#slot;
  }

  /** Our player's host element, to tell it from the site's elements. */
  get host(): HTMLElement {
    return this.#host;
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.#host.dataset.theme = theme;
  }

  wake(): void {
    this.#loop.wake();
  }

  /** The picture-in-picture button: out to a corner, pinned there across pages until asked back. */
  popOut(): void {
    if (this.#stage !== 'inline') {
      return;
    }

    this.#measured = null;
    this.#isPinned = true;
    this.#flyToCorner();
    this.wake();
  }

  /** Play here: into this embed, from wherever it is. The page it is on becomes the video's home. */
  playHere(slot: HTMLElement): void {
    this.#measured = null;
    this.#isPinned = false;
    this.#video.pagePath = location.pathname;

    if (this.#stage !== 'inline' || slot !== this.#slot) {
      this.#flyInto(slot);
    }

    this.wake();
  }

  /** Close: back to its embed if enough of it shows to watch there, however it got out; otherwise it stops. */
  close(): void {
    this.#measured = null;

    const slot = this.#homeSlot();
    const fraction = slot === null ? null : this.#shownFraction(slot.getBoundingClientRect());

    if (slot === null || closeAction(fraction) === 'stop') {
      this.end();

      return;
    }

    this.#isPinned = false;
    this.#flyInto(slot);
    this.wake();
  }

  /** Stops the video and takes the player away. */
  end(): void {
    if (this.#isEnded) {
      return;
    }

    this.#isEnded = true;
    this.#loop.stop();
    clearTimeout(this.#controlsTimer);

    for (const cleanup of this.#cleanups) {
      cleanup();
    }

    // Leaving the page first stops anything still playing in it.
    this.#frame.setAttribute('src', 'about:blank');
    this.#host.remove();
    this.#options.onEnd();
  }

  #createFrame(): HTMLIFrameElement {
    const video = this.#video;
    const frame = el('iframe', {
      attrs: {
        title: video.title,
        allow: video.allow,
        referrerpolicy: video.referrerPolicy,
        allowfullscreen: '',
      },
    });

    if (video.sandbox !== null) {
      frame.setAttribute('sandbox', video.sandbox);
    }

    frame.src = playerApiSrc(video.src, location.origin);

    return frame;
  }

  #createControls(): HTMLElement {
    const handles = CORNERS.map((corner) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      svg.setAttribute('viewBox', '0 0 40 40');
      arc.setAttribute('d', 'M7 26A19 19 0 0 1 26 7');
      arc.setAttribute('fill', 'none');
      arc.setAttribute('stroke', 'currentColor');
      arc.setAttribute('stroke-width', '5');
      arc.setAttribute('stroke-linecap', 'round');
      svg.append(arc);

      const handle = el('div', { className: 'handle live', attrs: { 'data-corner': corner, 'aria-hidden': 'true' } }, [
        svg,
      ]);

      handle.addEventListener('pointerdown', (event) => {
        this.#startResize(event, corner);
      });
      this.#track(handle);

      return handle;
    });
    const grabber = el('div', { className: 'grabber live', attrs: { 'aria-hidden': 'true' } }, [el('span')]);
    const close = el(
      'button',
      { className: 'live', attrs: { type: 'button', 'aria-label': 'Close video', title: 'Close video' } },
      [createSvgIcon(CLOSE_ICON, '')],
    );
    const fullscreen = el(
      'button',
      { className: 'live', attrs: { type: 'button', 'aria-label': 'Full screen', title: 'Full screen' } },
      [createSvgIcon(MAXIMIZE_ICON, '')],
    );

    // Where the browser can't, the button is hidden but keeps its space, so the grabber stays centred.
    if (!canGoFullscreen()) {
      fullscreen.setAttribute('data-unavailable', '');
    }

    grabber.addEventListener('pointerdown', this.#startDrag);
    this.#track(grabber);

    for (const button of [close, fullscreen]) {
      button.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
    }

    close.addEventListener('click', () => {
      this.close();
    });
    fullscreen.addEventListener('click', () => {
      goFullscreen(this.#frame);
    });

    return el('div', { className: 'controls' }, [
      ...handles,
      el('div', { className: 'bar' }, [close, grabber, fullscreen]),
    ]);
  }

  #track(element: HTMLElement): void {
    element.addEventListener('pointermove', this.#move);
    element.addEventListener('pointerup', this.#endInteraction);
    element.addEventListener('pointercancel', this.#endInteraction);
    element.addEventListener('lostpointercapture', this.#endInteraction);
  }

  /** Wakes the player whenever something it depends on may have moved. */
  #watch(): void {
    const wake = (): void => {
      this.wake();
    };
    const resizes = new ResizeObserver(wake);
    const mutations = new MutationObserver(wake);
    const resting = window.setInterval(() => {
      if (this.#stage === 'floating') {
        this.wake();
      }
    }, RESTING_CHECK_MS);

    // The page growing or shrinking above the embed moves it without a scroll.
    resizes.observe(document.body);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake);
    this.#cleanups.push(
      () => {
        resizes.disconnect();
      },
      () => {
        mutations.disconnect();
      },
      () => {
        window.clearInterval(resting);
      },
      () => {
        window.removeEventListener('scroll', wake);
      },
      () => {
        window.removeEventListener('resize', wake);
      },
      watchPlayback(this.#frame, this.#frame.src, (playback) => {
        this.#playback = playback;
        this.wake();
      }),
    );
  }

  readonly #showControls = (): void => {
    clearTimeout(this.#controlsTimer);
    this.#host.setAttribute('data-active', '');
  };

  readonly #scheduleHidingControls = (): void => {
    clearTimeout(this.#controlsTimer);
    this.#controlsTimer = window.setTimeout(() => {
      if (this.#interaction === null) {
        this.#host.removeAttribute('data-active');
      }
    }, CONTROLS_DELAY_MS);
  };

  // Reading the page.

  #measure(): Measured {
    if (this.#measured === null) {
      const viewport = this.#viewport();
      const ceilings = stickyHeaders(viewport).map(({ left, right, bottom }) => ({ left, right, bottom }));
      const obstacles = bottomBars(viewport).map(({ left, right, top }) => ({ left, right, top }));

      this.#measured = { viewport, ceilings, obstacles };
    }

    return this.#measured;
  }

  #viewport(): Size {
    return { width: document.documentElement.clientWidth, height: window.innerHeight };
  }

  #ceilingAbove(box: Box): number {
    return ceilingOver(box.x, box.x + box.width, this.#measure().ceilings);
  }

  #floorBelow(box: Box): number {
    const { obstacles, viewport } = this.#measure();

    return floorUnder(box.x, box.x + box.width, obstacles, viewport);
  }

  /** How much of an embed the reader can see, leaving out what is under a header or behind a bar. */
  #shownFraction(rect: DOMRect): number {
    const box = toBox(rect);

    return visibleFraction(rect, this.#measure().viewport, this.#ceilingAbove(box), this.#floorBelow(box));
  }

  /** Inline, it is placed against the document, so it scrolls with the page natively instead of trailing a frame. */
  #documentBox(slot: HTMLElement): Box {
    const rect = slot.getBoundingClientRect();

    return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height };
  }

  /** The embed's card rounds its top corners, so the player does too while it sits in them. */
  #slotRadius(slot: HTMLElement): string {
    const card = slot.parentElement;

    if (card === null) {
      return '0px';
    }

    const style = getComputedStyle(card);
    const border = Number.parseFloat(style.borderTopWidth) || 0;
    const radius = Math.max(0, (Number.parseFloat(style.borderTopLeftRadius) || 0) - border);
    const slotRect = slot.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const isInCorners =
      Math.abs(slotRect.top - cardRect.top - border) < 1 &&
      Math.abs(slotRect.width - (cardRect.width - border * 2)) < 1;

    return isInCorners ? `${String(radius)}px ${String(radius)}px 0 0` : '0px';
  }

  // Placing it.

  #place(position: 'absolute' | 'fixed', box: Box): void {
    const style = this.#host.style;

    style.position = position;
    style.transform = `translate3d(${String(box.x)}px, ${String(box.y)}px, 0)`;
    style.width = `${String(box.width)}px`;
    style.height = `${String(box.height)}px`;
    style.visibility = 'visible';
    this.#box = box;
  }

  #setRadius(radius: string): void {
    const surface = this.#host.shadowRoot?.querySelector<HTMLElement>('.surface');

    if (surface !== null && surface !== undefined) {
      surface.style.borderRadius = radius;
    }
  }

  #setFloating(isFloating: boolean): void {
    this.#host.style.zIndex = isFloating ? FLOATING_LAYER : INLINE_LAYER;
    // Its own layer in page transitions, so it isn't faded out and back in with the page.
    this.#host.style.setProperty('view-transition-name', isFloating ? 'dnpp-pip' : 'none');
    this.#host.toggleAttribute('data-floating', isFloating);

    if (this.#isFloating !== isFloating) {
      this.#isFloating = isFloating;
      this.#options.onChange();
    }
  }

  /** Pins it to the viewport where the embed is now, so it can fly off from there. */
  #lift(): void {
    if (this.#stage === 'inline') {
      this.#place('fixed', this.#lastSlotRect);
    }
  }

  #cornerTarget(): Box {
    const { viewport, obstacles, ceilings } = this.#measure();

    // Turning a tablet or resizing across the breakpoint switches to the placement remembered for it.
    if (this.#isPlacementCompact !== isCompact(viewport)) {
      this.#isPlacementCompact = isCompact(viewport);
      this.#placement = readPlacement(viewport);
    }

    const whole = { x: 0, y: 0, width: viewport.width, height: viewport.height };
    // Between a header along the top and a bar along the bottom, it stays small enough to keep its controls on screen.
    const room = {
      width: viewport.width,
      height:
        Math.min(viewport.height, this.#floorBelow(whole)) -
        Math.max(0, this.#ceilingAbove(whole) + CEILING_GAP - DOCK_MARGIN),
    };

    return cornerBox(
      this.#placement.corner,
      dockSize(this.#placement.length, this.#video.aspectRatio, room),
      viewport,
      obstacles,
      ceilings,
    );
  }

  #attach(slot: HTMLElement): void {
    const changed = this.#slot !== slot || this.#stage !== 'inline';

    this.#stage = 'inline';
    this.#slot = slot;
    this.#home = slot;
    this.#candidate = null;
    this.#hiddenSince = null;
    this.#velocity = RESTING_VELOCITY;
    this.#lastSlotRect = toBox(slot.getBoundingClientRect());
    this.#setRadius(this.#slotRadius(slot));
    this.#place('absolute', this.#documentBox(slot));
    this.#setFloating(false);

    if (changed) {
      this.#options.onChange();
    }
  }

  #flyInto(slot: HTMLElement): void {
    this.#lift();
    this.#stage = 'to-slot';
    this.#lastTarget = null;
    this.#slot = slot;
    this.#candidate = null;
    this.#hiddenSince = null;
    this.#setRadius(this.#slotRadius(slot));
    this.#setFloating(false);
    this.#options.onChange();
  }

  /**
   * Leaving its embed, it sets off from the edge of the screen the embed left by, so it reads as the same video
   * sliding back into view rather than one arriving from out of sight.
   */
  #flyToCorner(): void {
    if (this.#stage === 'inline') {
      this.#place(
        'fixed',
        departureBox(this.#lastSlotRect, this.#measure().viewport, this.#ceilingAbove(this.#lastSlotRect)),
      );
      this.#velocity = RESTING_VELOCITY;
    }

    this.#stage = 'to-corner';
    this.#slot = null;
    this.#candidate = null;
    this.#hiddenSince = null;
    this.#setRadius('');
    this.#setFloating(true);
  }

  /** Moves one frame along its spring toward where the target is now, and says whether it has arrived. */
  #chase(target: Box, seconds: number, isHoming = false): boolean {
    if (prefersReducedMotion()) {
      this.#velocity = RESTING_VELOCITY;
      this.#place('fixed', target);

      return true;
    }

    const spring = stepSpring({ position: this.#box, velocity: this.#velocity }, target, seconds, isHoming);
    const hasArrived = isSpringSettled(spring, target);

    this.#velocity = hasArrived ? RESTING_VELOCITY : spring.velocity;
    this.#place('fixed', hasArrived ? target : spring.position);

    return hasArrived;
  }

  /** A playing video leaves its embed once the embed has all but scrolled away, and stayed away a moment. */
  #hasScrolledPast(rect: DOMRect, now: number): boolean {
    const isAway =
      this.#options.isAutomatic() && this.#playback !== 'paused' && this.#shownFraction(rect) < POP_OUT_BELOW;

    if (!isAway) {
      this.#hiddenSince = null;

      return false;
    }

    this.#hiddenSince ??= now;

    return now - this.#hiddenSince >= SETTLE_MS;
  }

  /** Only the page the video was playing on takes it back by itself; anywhere else, its embeds offer to. */
  #isOnHomePage(): boolean {
    return location.pathname === this.#video.pagePath;
  }

  /** The embed it was last in, or, if the page has re-rendered it, the first embed of the video on the page. */
  #homeSlot(): HTMLElement | null {
    if (!this.#isOnHomePage()) {
      return null;
    }

    const home = this.#home;

    return home !== null && isShown(home) ? home : (this.#options.slotsFor(this.#video.key)[0] ?? null);
  }

  /**
   * Its embed gone, it goes back if the page only re-rendered it, and otherwise leaves at once, floating on or
   * stopping, instead of lingering over the next page.
   */
  #leaveEmbed(now: number): boolean {
    const replacement = this.#homeSlot();

    this.#slot = null;

    if (replacement !== null) {
      this.#flyInto(replacement);

      return true;
    }

    if (this.#isOnHomePage()) {
      this.#stage = 'holding';
      this.#since = now;

      return true;
    }

    if (afterEmbedLeft(this.#options.isAutomatic(), this.#playback === 'paused', false) === 'float') {
      this.#flyToCorner();

      return true;
    }

    this.end();

    return false;
  }

  /** One frame of the player's life. It says whether it needs another frame straight away, or can sleep. */
  #step(now: number, seconds: number): boolean {
    if (this.#isEnded) {
      return false;
    }

    if (this.#stage === 'inline') {
      const slot = this.#slot;

      if (slot === null || !isShown(slot)) {
        this.#lift();

        return this.#leaveEmbed(now);
      }

      const rect = slot.getBoundingClientRect();
      const box = this.#documentBox(slot);

      this.#lastSlotRect = toBox(rect);

      if (!isSameBox(box, this.#box)) {
        this.#place('absolute', box);
      }

      if (this.#hasScrolledPast(rect, now)) {
        this.#flyToCorner();

        return true;
      }

      return this.#hiddenSince !== null;
    }

    if (this.#stage === 'to-slot') {
      const slot = this.#slot;

      if (slot === null || !isShown(slot)) {
        return this.#leaveEmbed(now);
      }

      const rect = slot.getBoundingClientRect();

      // Scrolled away again before it got there, it turns back for the corner.
      if (this.#hasScrolledPast(rect, now)) {
        this.#flyToCorner();

        return true;
      }

      const target = toBox(rect);

      // Heading home, it moves with the embed as the page scrolls, so it only ever closes the gap between them.
      if (this.#lastTarget !== null) {
        this.#place('fixed', carriedBy(this.#box, this.#lastTarget, target));
      }

      this.#lastTarget = target;

      if (this.#chase(target, seconds, true)) {
        this.#attach(slot);

        return false;
      }

      return true;
    }

    const slot = this.#homeSlot();
    const visibleSlot =
      returnsByItself(this.#options.isAutomatic(), this.#isPinned) &&
      slot !== null &&
      this.#shownFraction(slot.getBoundingClientRect()) >= RETURN_ABOVE
        ? slot
        : null;

    if (visibleSlot !== this.#candidate) {
      this.#candidate = visibleSlot;
      this.#candidateSince = now;
    }

    if (this.#candidate !== null && now - this.#candidateSince >= SETTLE_MS) {
      this.#flyInto(this.#candidate);

      return true;
    }

    if (this.#stage === 'holding') {
      if (this.#isOnHomePage() && now - this.#since < SETTLE_MS) {
        return true;
      }

      const action = afterEmbedLeft(this.#options.isAutomatic(), this.#playback === 'paused', slot !== null);

      if (action === 'float') {
        this.#flyToCorner();
      } else if (action === 'return' && slot !== null) {
        this.#flyInto(slot);
      } else {
        this.end();

        return false;
      }

      return true;
    }

    if (this.#stage === 'floating') {
      if (!isSameBox(this.#cornerTarget(), this.#box)) {
        this.#stage = 'to-corner';

        return true;
      }

      return this.#candidate !== null;
    }

    if (this.#chase(this.#cornerTarget(), seconds)) {
      this.#stage = 'floating';
    }

    return true;
  }

  // Dragging and resizing, by the grabber and the corner handles.

  #startInteraction(event: PointerEvent, interaction: Interaction): void {
    // It can be caught mid-flight to its corner, as well as once it rests there.
    if (event.button !== 0 || (this.#stage !== 'floating' && this.#stage !== 'to-corner')) {
      return;
    }

    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.#interaction = interaction;
    this.#velocity = RESTING_VELOCITY;
    this.#host.setAttribute('data-interacting', '');
  }

  readonly #startDrag = (event: PointerEvent): void => {
    const box = this.#box;

    this.#startInteraction(event, {
      kind: 'drag',
      offset: { x: event.clientX - box.x, y: event.clientY - box.y },
      samples: [{ x: event.clientX, y: event.clientY, time: event.timeStamp }],
    });
  };

  #startResize(event: PointerEvent, handle: Corner): void {
    this.#startInteraction(event, {
      kind: 'resize',
      anchor: oppositeCorner(handle),
      start: this.#box,
      length: this.#placement.length,
    });
  }

  readonly #move = (event: PointerEvent): void => {
    const interaction = this.#interaction;

    if (interaction === null) {
      return;
    }

    const viewport = this.#viewport();

    if (interaction.kind === 'drag') {
      const box = this.#box;

      interaction.samples = [
        ...interaction.samples.filter((sample) => event.timeStamp - sample.time < 100),
        { x: event.clientX, y: event.clientY, time: event.timeStamp },
      ];
      this.#place('fixed', {
        ...box,
        x: Math.min(Math.max(event.clientX - interaction.offset.x, 0), viewport.width - box.width),
        y: Math.min(Math.max(event.clientY - interaction.offset.y, 0), viewport.height - box.height),
      });

      return;
    }

    const { anchor, start } = interaction;
    const resized = dockSize(
      resizedLength(anchor, start, { x: event.clientX, y: event.clientY }, this.#video.aspectRatio),
      this.#video.aspectRatio,
      viewport,
    );

    interaction.length = Math.max(resized.width, resized.height);
    this.#place('fixed', {
      ...resized,
      x: anchor.endsWith('right') ? start.x + start.width - resized.width : start.x,
      y: anchor.startsWith('bottom') ? start.y + start.height - resized.height : start.y,
    });
  };

  readonly #endInteraction = (event: PointerEvent): void => {
    const interaction = this.#interaction;

    if (interaction === null) {
      return;
    }

    this.#interaction = null;
    this.#measured = null;
    this.#host.removeAttribute('data-interacting');

    const viewport = this.#viewport();

    if (interaction.kind === 'drag') {
      const [first = { x: event.clientX, y: event.clientY, time: event.timeStamp }] = interaction.samples;
      const elapsed = Math.max(event.timeStamp - first.time, 1);
      const box = this.#box;
      const fling = { x: (event.clientX - first.x) / elapsed, y: (event.clientY - first.y) / elapsed };

      this.#placement = {
        ...this.#placement,
        corner: nearestCorner({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, fling, viewport),
      };
      // The throw carries on into the spring, so letting go doesn't stop it dead before it settles.
      this.#velocity = { x: fling.x * 1000, y: fling.y * 1000, width: 0, height: 0 };
    } else {
      this.#placement = { ...this.#placement, length: interaction.length };
    }

    writePlacement(this.#placement, viewport);
    this.#stage = 'to-corner';
    this.wake();
  };
}
