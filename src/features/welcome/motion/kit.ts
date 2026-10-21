import { createSvgIcon, el } from '@/core/dom';

import { COPY_LINK, QUOTE, REPLY, STAR } from './icons';
import { EASE, type Stop, type Timeline } from './timeline';

type Child = Node | string | null | undefined | false;

/** A <div>, the way every picture is built. */
export function box(className: string, children: readonly Child[] = []): HTMLDivElement {
  return el('div', { className }, children);
}

/** A <span>. */
export function text(className: string, content: string): HTMLSpanElement {
  return el('span', { className }, [content]);
}

/** Puts a piece at a place on the stage, in the picture's own 512 by 288 pixels. */
export function place<T extends HTMLElement | SVGElement>(
  element: T,
  at: { x: number; y: number; w?: number; h?: number },
): T {
  element.style.position = 'absolute';
  element.style.left = `${String(at.x)}px`;
  element.style.top = `${String(at.y)}px`;

  if (at.w !== undefined) {
    element.style.width = `${String(at.w)}px`;
  }

  if (at.h !== undefined) {
    element.style.height = `${String(at.h)}px`;
  }

  return element;
}

/** A person's picture without a person in it: a soft gradient in two of the site's lane colours, and a head and shoulders. */
export function avatar(className: string, lanes: readonly [number, number]): HTMLDivElement {
  const element = box(`avatar ${className}`, [box('head'), box('shoulders')]);

  element.style.setProperty('--from', `var(--lane-${String(lanes[0])})`);
  element.style.setProperty('--to', `var(--lane-${String(lanes[1])})`);

  return element;
}

export interface PostParts {
  name: string;
  handle: string;
  time: string;
  lane: number;
  avatarLanes: readonly [number, number];
  body: Child | readonly Child[];
  /** The small row of counts and buttons under a commit. */
  actions?: boolean;
  media?: Node;
  /** Something at the end of the row of buttons, like the picture-in-picture button. */
  extra?: Node;
}

/** A commit as the log shows it: the avatar on the rail in the author's colour, the name, the words, the buttons. */
export function post(parts: PostParts): HTMLElement {
  const element = el('article', { className: 'post' });
  const actions = box('tools', [
    box('act', [createSvgIcon(STAR, ''), text('', '12')]),
    box('act', [createSvgIcon(QUOTE, ''), text('', 'Quote')]),
    box('act', [createSvgIcon(REPLY, ''), text('', 'Reply')]),
    box('act copy', [createSvgIcon(COPY_LINK, '')]),
  ]);

  if (parts.extra !== undefined) {
    actions.append(parts.extra);
  }

  element.style.setProperty('--lane', `var(--lane-${String(parts.lane)})`);
  element.append(
    box('rail', [box('tail'), box('ring', [avatar('', parts.avatarLanes)])]),
    box('main', [
      box('meta', [
        text('name', parts.name),
        text('handle', parts.handle),
        text('sep', '·'),
        text('handle', parts.time),
      ]),
      box('words', Array.isArray(parts.body) ? (parts.body as readonly Child[]) : [parts.body as Child]),
      parts.media,
      parts.actions === false ? null : actions,
    ]),
  );

  return element;
}

/** Lines standing in for words, in a page that is only there to be recognised as a page. */
export function lines(widths: readonly number[]): HTMLElement[] {
  return widths.map((width) => {
    const line = box('line');

    line.style.width = `${String(width)}%`;

    return line;
  });
}

export interface Cursor {
  element: HTMLElement;
  pointer: HTMLElement;
  ripple: HTMLElement;
  hold: HTMLElement;
  progress: SVGCircleElement;
}

const CURSOR_ARROW = 'M1.5 1.5 1.5 17 5.6 13.1 8.3 19.4 11.1 18.2 8.4 12 14 12Z';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const HOLD_LENGTH = 88;

/** The pointer that shows how each feature is used: it moves, presses, and holds with a ring that fills. */
export function createCursor(): Cursor {
  const arrow = document.createElementNS(SVG_NAMESPACE, 'svg');
  const path = document.createElementNS(SVG_NAMESPACE, 'path');

  arrow.setAttribute('viewBox', '0 0 16 21');
  arrow.setAttribute('class', 'arrow');
  path.setAttribute('d', CURSOR_ARROW);
  arrow.append(path);

  const ring = document.createElementNS(SVG_NAMESPACE, 'svg');
  const track = document.createElementNS(SVG_NAMESPACE, 'circle');
  const progress = document.createElementNS(SVG_NAMESPACE, 'circle');

  ring.setAttribute('viewBox', '0 0 36 36');
  ring.setAttribute('class', 'hold-ring');

  for (const circle of [track, progress]) {
    circle.setAttribute('cx', '18');
    circle.setAttribute('cy', '18');
    circle.setAttribute('r', '14');
  }

  track.setAttribute('class', 'track');
  progress.setAttribute('class', 'progress');
  progress.setAttribute('stroke-dasharray', String(HOLD_LENGTH));
  progress.setAttribute('stroke-dashoffset', String(HOLD_LENGTH));
  ring.append(track, progress);

  const pointer = box('pointer', [arrow]);
  const ripple = box('ripple');
  const hold = box('hold', [ring]);

  return { element: box('cursor', [ripple, hold, pointer]), pointer, ripple, hold, progress };
}

/** Moves the cursor through places on the stage: when, where its tip is, and how it gets there. */
export function glide(
  timeline: Timeline,
  cursor: Cursor,
  path: readonly (readonly [number, number, number, string?])[],
): void {
  timeline.track(
    cursor.element,
    path.map(([at, x, y, easing]): Stop => [at, { translate: `${String(x)}px ${String(y)}px` }, easing ?? EASE.inOut]),
  );
}

export interface Tap {
  /** When the pointer goes down. */
  at: number;
  /** How long it stays down. A press that lasts is a hold, and a ring around the pointer fills while it does. */
  hold?: number;
}

/**
 * The pointer's presses, all in one go: a track can only be written once for each thing it moves. A click dips the
 * pointer and spreads a ring from its tip; a hold keeps it down while a ring around it fills.
 */
export function tap(timeline: Timeline, cursor: Cursor, taps: readonly Tap[]): void {
  const pointer: Stop[] = [];
  // Hidden until the first press: a track holds its first stop's look from the start of the loop.
  const ripple: Stop[] = [[0, { opacity: 0, scale: 0.35 }, EASE.hold]];
  const hold: Stop[] = [[0, { opacity: 0, scale: 0.7 }, EASE.hold]];
  const progress: Stop[] = [[0, { strokeDashoffset: HOLD_LENGTH }, EASE.hold]];

  for (const { at, hold: time = 0 } of taps) {
    const release = at + Math.max(time, 120);

    pointer.push(
      [at - 80, { scale: 1 }, EASE.out],
      [at + 60, { scale: 0.84 }, EASE.linear],
      [release, { scale: 0.84 }, EASE.out],
      [release + 220, { scale: 1 }, EASE.hold],
    );

    if (time === 0) {
      ripple.push([at, { opacity: 0.55, scale: 0.35 }, EASE.out], [at + 520, { opacity: 0, scale: 1.5 }, EASE.hold]);
    } else {
      hold.push(
        [at, { opacity: 0, scale: 0.7 }, EASE.out],
        [at + 140, { opacity: 1, scale: 1 }, EASE.linear],
        [release, { opacity: 1, scale: 1 }, EASE.out],
        [release + 220, { opacity: 0, scale: 1.15 }, EASE.hold],
      );
      progress.push(
        [at + 100, { strokeDashoffset: HOLD_LENGTH }, EASE.linear],
        [release, { strokeDashoffset: 0 }, EASE.hold],
        [release + 220, { strokeDashoffset: HOLD_LENGTH }, EASE.hold],
      );
    }
  }

  if (pointer.length > 0) {
    timeline.track(cursor.pointer, pointer);
  }

  if (ripple.length > 1) {
    timeline.track(cursor.ripple, ripple);
  }

  if (hold.length > 1) {
    timeline.track(cursor.hold, hold);
    timeline.track(cursor.progress, progress);
  }
}

/** A photograph that is not of anyone: a sunset over two ridges. Fixed colours, since a picture does not follow the theme. */
export function sunset(className = ''): HTMLDivElement {
  return box(`photo ${className}`, [box('sun'), box('ridge far'), box('ridge near')]);
}

/** A screenshot of some code, as lines in colours. */
export function code(className = ''): HTMLDivElement {
  const tones = ['#f06595', '#74c0fc', '#ffd43b', '#69db7c', '#da77f2'];
  const widths = [62, 38, 78, 50, 70, 30, 56, 44];
  const dots = box(
    'dots',
    ['#ff6b6b', '#ffd43b', '#51cf66'].map((tone) => {
      const dot = document.createElement('b');

      dot.style.setProperty('--tone', tone);

      return dot;
    }),
  );
  const rows = widths.map((width, index) => {
    const line = document.createElement('i');

    line.style.width = `${String(width)}%`;
    line.style.setProperty('--tone', tones[index % tones.length] ?? '#fff');

    return line;
  });

  return box(`photo code ${className}`, [dots, ...rows]);
}
