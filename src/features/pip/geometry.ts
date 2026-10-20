/**
 * Where the floating video player sits and how big it is, kept apart from the DOM so it can be reasoned about alone.
 * Ported from dev-null.sh pull request #686 (resources/js/lib/video-dock-geometry.ts), whose behaviour this follows.
 */

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const CORNERS: readonly Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Something fixed to the bottom of the viewport, like the mobile nav or the chat dock, that the player rests above. */
export interface Obstacle {
  left: number;
  right: number;
  top: number;
}

/** A header stuck to the top of the page. The page scrolls beneath it, so the player rests below it. */
export interface Ceiling {
  left: number;
  right: number;
  bottom: number;
}

export interface Placement {
  corner: Corner;
  /** The player's longer side. */
  length: number;
}

export const CEILING_GAP = 16;
/** The resize handles curve around the corners from just outside, and the controls hang below, so it keeps clear. */
export const DOCK_MARGIN = 24;
export const DOCK_CONTROLS_SPACE = 52;
export const MIN_LENGTH = 200;
export const MAX_LENGTH = 720;
/** Below the site's `md` breakpoint it is laid out for a phone: nav along the bottom, a thumb doing the scrolling. */
export const COMPACT_BELOW = 768;

/** A playing video floats once all but a sliver has scrolled away, and comes back once most of it shows again. */
export const POP_OUT_BELOW = 0.25;
export const RETURN_ABOVE = 0.6;

export const RESTING_VELOCITY: Box = { x: 0, y: 0, width: 0, height: 0 };

/** How far down the visible page ends below a horizontal span: above the highest bar fixed to the bottom under it. */
export function floorUnder(left: number, right: number, obstacles: readonly Obstacle[], viewport: Size): number {
  return obstacles
    .filter((obstacle) => obstacle.left < right && obstacle.right > left)
    .reduce((floor, obstacle) => Math.min(floor, obstacle.top), viewport.height);
}

/** How far down the visible page starts above a horizontal span: below the lowest header stuck over it. */
export function ceilingOver(left: number, right: number, ceilings: readonly Ceiling[]): number {
  return ceilings
    .filter((ceiling) => ceiling.left < right && ceiling.right > left)
    .reduce((top, ceiling) => Math.max(top, ceiling.bottom), 0);
}

/** Reads a CSS `aspect-ratio` such as `16 / 9`. */
export function parseAspectRatio(value: string | null | undefined): number | null {
  const [width = Number.NaN, height = Number.NaN] = (value ?? '').split('/').map((side) => Number.parseFloat(side));

  return width > 0 && height > 0 ? width / height : null;
}

export function isCompact(viewport: Size): boolean {
  return viewport.width < COMPACT_BELOW;
}

export function defaultLength(viewport: Size): number {
  return Math.round(Math.min(360, viewport.width * 0.6));
}

/** Wide screens start bottom right; phones start top right, out of the way of the bottom nav and the thumb. */
export function defaultCorner(viewport: Size): Corner {
  return isCompact(viewport) ? 'top-right' : 'bottom-right';
}

/** The length is the longer side, so a portrait video floats as tall as a landscape one is wide. */
export function dockSize(length: number, aspectRatio: number, viewport: Size): Size {
  const largest = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, length));
  const size =
    aspectRatio >= 1
      ? { width: largest, height: largest / aspectRatio }
      : { width: largest * aspectRatio, height: largest };
  const scale = Math.min(
    1,
    (viewport.width - DOCK_MARGIN * 2) / size.width,
    (viewport.height - DOCK_MARGIN - DOCK_CONTROLS_SPACE) / size.height,
  );

  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

export function cornerBox(
  corner: Corner,
  size: Size,
  viewport: Size,
  obstacles: readonly Obstacle[] = [],
  ceilings: readonly Ceiling[] = [],
): Box {
  const x = corner.endsWith('left') ? DOCK_MARGIN : viewport.width - DOCK_MARGIN - size.width;

  if (corner.startsWith('top')) {
    const ceiling = ceilingOver(x, x + size.width, ceilings);

    return { x, y: ceiling > 0 ? ceiling + CEILING_GAP : DOCK_MARGIN, ...size };
  }

  const floor = floorUnder(x, x + size.width, obstacles, viewport);

  return { x, y: Math.max(DOCK_MARGIN, floor - DOCK_CONTROLS_SPACE - size.height), ...size };
}

/** A fling carries on for a moment, so a quick flick toward a corner lands there even if let go short of the middle. */
export function nearestCorner(center: Point, velocity: Point, viewport: Size): Corner {
  const projection = 200;
  const x = center.x + velocity.x * projection;
  const y = center.y + velocity.y * projection;

  return `${y < viewport.height / 2 ? 'top' : 'bottom'}-${x < viewport.width / 2 ? 'left' : 'right'}`;
}

/** Resizing pulls one corner while the opposite one, the anchor, stays put. */
export function resizedLength(anchor: Corner, box: Box, pointer: Point, aspectRatio: number): number {
  const width = anchor.endsWith('left') ? pointer.x - box.x : box.x + box.width - pointer.x;
  const height = anchor.startsWith('top') ? pointer.y - box.y : box.y + box.height - pointer.y;

  return aspectRatio >= 1 ? Math.max(width, height * aspectRatio) : Math.max(height, width / aspectRatio);
}

export function oppositeCorner(corner: Corner): Corner {
  const [vertical, horizontal] = corner.split('-');

  return `${vertical === 'top' ? 'bottom' : 'top'}-${horizontal === 'left' ? 'right' : 'left'}`;
}

/** Closing hands the video back to its embed when enough of it shows to watch there, and stops it otherwise. */
export function closeAction(embedFraction: number | null): 'return' | 'stop' {
  return embedFraction !== null && embedFraction >= POP_OUT_BELOW ? 'return' : 'stop';
}

/** Only a video that floated by itself goes back by itself; one pinned by hand stays out until asked back. */
export function returnsByItself(isAutomatic: boolean, isPinned: boolean): boolean {
  return isAutomatic && !isPinned;
}

/**
 * Once its embed has left the page, a playing video floats on if picture-in-picture is automatic. Otherwise, a paused
 * or finished one included, it goes back to its embed if the page still has one, and stops if it doesn't.
 */
export function afterEmbedLeft(
  isAutomatic: boolean,
  isPaused: boolean,
  hasHomeEmbed: boolean,
): 'float' | 'return' | 'stop' {
  if (isAutomatic && !isPaused) {
    return 'float';
  }

  return hasHomeEmbed ? 'return' : 'stop';
}

/**
 * Where a video scrolled past sets off from: no further out than the sliver last seen at the edge it left by, so it
 * slides back in from that edge. Under a header, that edge is the header's bottom.
 */
export function departureBox(rect: Box, viewport: Size, top = 0): Box {
  const sliver = rect.height * POP_OUT_BELOW;

  return { ...rect, y: Math.min(Math.max(rect.y, top + sliver - rect.height), viewport.height - sliver) };
}

/** How much of an embed shows, counting what is under a header above it, or behind a bar below it, as hidden. */
export function visibleFraction(
  rect: { top: number; height: number },
  viewport: Size,
  top = 0,
  bottom = viewport.height,
): number {
  if (rect.height <= 0) {
    return 0;
  }

  const visible = Math.min(rect.top + rect.height, bottom) - Math.max(rect.top, top);

  return Math.max(0, visible) / rect.height;
}

/**
 * The player moves on a spring that chases its target wherever it is this frame, so it lands exactly on an embed that
 * is still scrolling, and turns around mid-flight without a jolt.
 */
export interface Spring {
  position: Box;
  velocity: Box;
}

const STIFFNESS = 260;
const SPRING_STEP = 1 / 240;
const SIDES = ['x', 'y', 'width', 'height'] as const;
/** Slightly under critically damped, so it overshoots a touch and settles, as a spring does. */
const DAMPING_RATIO = 0.8;
/** Homing in on an embed, the pull grows as the gap closes, so the last stretch is closed firmly. */
export const HOMING_BOOST = 4;
export const HOMING_RANGE = 80;

export function springStiffness(gap: number, isHoming: boolean): number {
  if (!isHoming) {
    return STIFFNESS;
  }

  const closeness = Math.max(0, 1 - Math.abs(gap) / HOMING_RANGE);

  return STIFFNESS * (1 + HOMING_BOOST * closeness);
}

export function stepSpring(spring: Spring, target: Box, seconds: number, isHoming = false): Spring {
  const position = { ...spring.position };
  const velocity = { ...spring.velocity };
  const steps = Math.max(1, Math.ceil(seconds / SPRING_STEP));
  const step = seconds / steps;

  for (let index = 0; index < steps; index++) {
    for (const side of SIDES) {
      const gap = position[side] - target[side];
      const pull = springStiffness(gap, isHoming);
      const acceleration = -pull * gap - 2 * DAMPING_RATIO * Math.sqrt(pull) * velocity[side];

      velocity[side] += acceleration * step;
      position[side] += velocity[side] * step;
    }
  }

  return { position, velocity };
}

/** Carries the player along with a target that moved, so the spring only closes the gap and scrolling can't outrun it. */
export function carriedBy(position: Box, from: Box, to: Box): Box {
  return { ...position, x: position.x + to.x - from.x, y: position.y + to.y - from.y };
}

export function isSpringSettled(spring: Spring, target: Box): boolean {
  return SIDES.every(
    (side) => Math.abs(spring.position[side] - target[side]) < 0.5 && Math.abs(spring.velocity[side]) < 20,
  );
}

export function isSameBox(first: Box, second: Box): boolean {
  return SIDES.every((side) => Math.abs(first[side] - second[side]) < 0.5);
}
