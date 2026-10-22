/**
 * A small timeline for the welcome's pictures: each picture is a looping set of tracks, written in milliseconds, one
 * track per element. A track is a list of stops, and the element eases from each stop to the next.
 *
 * It runs on the Web Animations API, so the motion stays on the compositor and as smooth as the page itself, and it
 * can also be stopped and moved to any moment: that is how the README's videos are rendered, one exact frame at a time.
 */

export type Style = Record<string, string | number>;

/** When, in milliseconds from the start of the loop; what the element looks like then; how it eases to the next stop. */
export type Stop = readonly [at: number, style: Style, easing?: string];

export const EASE = {
  /** A quick start and a long, soft landing. The default for things arriving. */
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Gentle at both ends. For things travelling across the picture. */
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  /** Slow to leave, quick to go. For things leaving. */
  in: 'cubic-bezier(0.5, 0, 0.75, 0)',
  linear: 'linear',
  /** Keeps this stop's look until the next stop, then changes at once. */
  hold: 'step-end',
} as const;

/** An overshoot that settles, as a CSS `linear()` curve sampled from a damped spring. Lower `speed` settles slower. */
export function spring(bounce = 0.35, speed = 12): string {
  const damping = 1 - Math.min(Math.max(bounce, 0), 0.9);
  const omega = speed;
  const damped = omega * Math.sqrt(Math.max(1 - damping * damping, 0.01));
  const points: string[] = [];

  for (let step = 0; step <= 40; step++) {
    const time = step / 40;
    const decay = Math.exp(-damping * omega * time);
    const value =
      step === 40 ? 1 : 1 - decay * (Math.cos(damped * time) + ((damping * omega) / damped) * Math.sin(damped * time));

    points.push(value.toFixed(4));
  }

  return `linear(${points.join(', ')})`;
}

/** Stops that go through `frames` again and again from `from` to `to`, a trip each `period` milliseconds. */
export function repeat(
  from: number,
  to: number,
  period: number,
  frames: readonly Style[],
  easing: string = EASE.inOut,
): Stop[] {
  const trips = Math.max(1, Math.round((to - from) / period));
  const length = (to - from) / trips;
  const stops: Stop[] = [];

  for (let trip = 0; trip < trips; trip++) {
    frames.forEach((style, index) => {
      stops.push([from + trip * length + (index / frames.length) * length, style, easing]);
    });
  }

  stops.push([to, frames[0] ?? {}, easing]);

  return stops;
}

/** A steady turn, `turn` milliseconds a time, from `from` to `to`. */
export function spin(from: number, to: number, turn = 700): Stop[] {
  return [
    [from, { rotate: '0deg' }, EASE.linear],
    [to, { rotate: `${String(Math.max(1, Math.round((to - from) / turn)) * 360)}deg` }, EASE.hold],
  ];
}

/** The styles a track sets, in the order of its stops, so each one can be held before its first stop and after its last. */
function filled(stops: readonly Stop[], duration: number): Keyframe[] {
  const first: Style = {};
  const last: Style = {};

  for (const [, style] of stops) {
    for (const [name, value] of Object.entries(style)) {
      first[name] ??= value;
      last[name] = value;
    }
  }

  const frames: Keyframe[] = stops.map(([at, style, easing]) => ({
    ...style,
    offset: Math.min(Math.max(at / duration, 0), 1),
    easing: easing ?? EASE.out,
  }));

  if ((stops[0]?.[0] ?? 0) > 0) {
    frames.unshift({ ...first, offset: 0, easing: EASE.hold });
  }

  if ((stops[stops.length - 1]?.[0] ?? duration) < duration) {
    frames.push({ ...last, offset: 1 });
  }

  return frames;
}

export class Timeline {
  readonly duration: number;
  readonly #animations: Animation[] = [];

  constructor(duration: number) {
    this.duration = duration;
  }

  /**
   * Animates `target` through `stops`. Every stop sets the same properties. An element can have several tracks, as long
   * as they set different properties: a property is only ever written by one.
   */
  track(target: Element, stops: readonly Stop[]): void {
    // A stop that leaves a property out would let it ease across the stops on either side, which is never what was meant.
    const names = Object.keys(stops[0]?.[1] ?? {})
      .sort()
      .join();

    for (const [, style] of stops) {
      if (Object.keys(style).sort().join() !== names) {
        throw new Error(
          `Every stop in a track sets the same properties; this one has ${names} and ${Object.keys(style).join()}.`,
        );
      }
    }

    const animation = target.animate(filled(stops, this.duration), {
      duration: this.duration,
      iterations: Infinity,
      fill: 'both',
    });

    animation.pause();
    this.#animations.push(animation);
  }

  /** Starts every track together, from the beginning. */
  play(): void {
    const start = document.timeline.currentTime;

    for (const animation of this.#animations) {
      animation.startTime = start;
    }
  }

  /** Holds every track at `at` milliseconds. */
  seek(at: number): void {
    for (const animation of this.#animations) {
      animation.pause();
      animation.currentTime = at;
    }
  }

  destroy(): void {
    for (const animation of this.#animations) {
      // Cancelling rejects the animation's `finished` promise. That is expected here, so mark it handled first.
      animation.finished.catch(() => undefined);
      animation.cancel();
    }

    this.#animations.length = 0;
  }
}

/**
 * Types `text` into `parent` one letter at a time, from `start`, a letter every `every` milliseconds, with a caret that
 * follows the last one. Every letter is its own element so the typing is part of the timeline. Returns when it ends.
 */
export function typeText(
  timeline: Timeline,
  parent: HTMLElement,
  text: string,
  start: number,
  every: number,
  caretUntil?: number,
): number {
  const letters = Array.from(text);

  letters.forEach((letter, index) => {
    const at = start + index * every;
    const next = start + (index + 1) * every;
    const element = document.createElement('span');
    const caret = document.createElement('i');

    element.className = 'ch';
    element.textContent = letter;
    caret.className = 'caret';
    element.append(caret);
    parent.append(element);

    timeline.track(element, [
      [at, { opacity: 0 }, EASE.hold],
      [at + 1, { opacity: 1 }],
    ]);
    timeline.track(caret, [
      [at, { opacity: 0 }, EASE.hold],
      [at + 1, { opacity: 1 }, EASE.hold],
      [index === letters.length - 1 ? (caretUntil ?? next) : next, { opacity: 0 }],
    ]);
  });

  return start + letters.length * every;
}
