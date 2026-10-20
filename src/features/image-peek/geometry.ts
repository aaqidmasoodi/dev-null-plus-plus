/**
 * The geometry of an image peek: where an image is actually drawn on the page, where its peek ends up, and the frame
 * that makes the peek look exactly like the image it came from. All plain maths, so it can be tested without layout.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** How an `<img>` fits its picture into its box, from its computed `object-fit`. */
export type ObjectFit = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';

/** Reads a computed `object-position` such as `50% 50%` or `0px 10px` into offsets within the free space. */
export function parseObjectPosition(value: string, free: Size): { x: number; y: number } {
  const [x = '50%', y = '50%'] = value.trim().split(/\s+/);
  const offset = (part: string, space: number): number => {
    const number = Number.parseFloat(part);

    if (Number.isNaN(number)) {
      return space / 2;
    }

    return part.endsWith('%') ? (space * number) / 100 : number;
  };

  return { x: offset(x, free.width), y: offset(y, free.height) };
}

/**
 * Where the picture is drawn, which can be larger than its box (`cover`, cropped by the box) or smaller (`contain`,
 * with empty bands).
 */
export function drawnRect(box: Rect, natural: Size, fit: ObjectFit, position = '50% 50%'): Rect {
  let size: Size;

  const contain = Math.min(box.width / natural.width, box.height / natural.height);
  const cover = Math.max(box.width / natural.width, box.height / natural.height);

  switch (fit) {
    case 'contain':
      size = { width: natural.width * contain, height: natural.height * contain };
      break;
    case 'cover':
      size = { width: natural.width * cover, height: natural.height * cover };
      break;
    case 'none':
      size = { ...natural };
      break;
    case 'scale-down': {
      const scale = Math.min(1, contain);

      size = { width: natural.width * scale, height: natural.height * scale };
      break;
    }
    default:
      // `fill`, the default, and anything unexpected: stretched to the box.
      return { ...box };
  }

  const offset = parseObjectPosition(position, { width: box.width - size.width, height: box.height - size.height });

  return { left: box.left + offset.x, top: box.top + offset.y, ...size };
}

/** The overlap of two rectangles, or `null` if they do not overlap. */
export function intersect(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);

  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

/** How big a peek grows: as large as fits the viewport, kept sharp, and always clearly bigger than where it started. */
export const PEEK_MARGIN = 0.06;
const MIN_GROWTH = 1.6;

/**
 * Where the peek ends up: centred, keeping the picture's shape, as large as fits inside the viewport with a margin.
 * A small picture is not blown up past its own size, unless that would barely grow it, so it never looks blurry for
 * nothing but always visibly grows.
 */
export function peekRect(viewport: Size, natural: Size, drawn: Size): Rect {
  const room = {
    width: viewport.width * (1 - 2 * PEEK_MARGIN),
    height: viewport.height * (1 - 2 * PEEK_MARGIN),
  };
  const fit = Math.min(room.width / natural.width, room.height / natural.height);
  const atLeast = (MIN_GROWTH * drawn.width) / natural.width;
  const scale = Math.min(fit, Math.max(1, atLeast));
  const width = natural.width * scale;
  const height = natural.height * scale;

  return { left: (viewport.width - width) / 2, top: (viewport.height - height) / 2, width, height };
}

/** A keyframe of the peek: where it is, and how much of it shows. */
export type PeekFrame = Keyframe & { transform: string; clipPath: string };

const px = (value: number): string => `${String(Math.round(value * 100) / 100)}px`;

/**
 * The frame that makes the peek, laid out at `peek`, look exactly like the picture as drawn on the page: moved and
 * scaled onto `drawn`, and clipped to the part of it that `visible` shows, with the page's rounded corners. The clip
 * is in the peek's own, unscaled, coordinates.
 */
export function frameAt(peek: Rect, drawn: Rect, visible: Rect, radius: number): PeekFrame {
  const scale = drawn.width / peek.width;
  const scaleY = drawn.height / peek.height;
  const top = (visible.top - drawn.top) / scaleY;
  const left = (visible.left - drawn.left) / scale;
  const bottom = (drawn.top + drawn.height - (visible.top + visible.height)) / scaleY;
  const right = (drawn.left + drawn.width - (visible.left + visible.width)) / scale;

  return {
    // Scaling happens around the top-left corner, so the peek lands exactly on the drawn picture.
    transform: `translate(${px(drawn.left - peek.left)}, ${px(drawn.top - peek.top)}) scale(${String(scale)}, ${String(scaleY)})`,
    clipPath: `inset(${px(top)} ${px(right)} ${px(bottom)} ${px(left)} round ${px(radius / scale)})`,
  };
}

/** The peek at rest: in place, uncut, with its own rounded corners. */
export function restingFrame(radius: number): PeekFrame {
  return { transform: 'translate(0px, 0px) scale(1, 1)', clipPath: `inset(0px 0px 0px 0px round ${px(radius)})` };
}
