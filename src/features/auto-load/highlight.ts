/**
 * Keeps freshly loaded commits softly tinted blue, so the reader can tell at a glance which ones are new, and lets the
 * tint go once they have had a chance to see them.
 *
 * The tint follows attention rather than a fixed clock. While the reader is still (perhaps not even looking), it
 * stays. Once they move the mouse, scroll, touch or type, they have seen the page, and it fades a few seconds later.
 * A long cap clears it even if they never come back.
 *
 * Only real input counts. The site smooth-scrolls to the top right after loading, which fires `scroll` events, so
 * `scroll` itself is not listened to; wheel, touch, keys and actual pointer movement are.
 *
 * Done with the Web Animations API, which styles the rows without touching any attribute React owns, so the site's
 * re-renders neither fight it nor get confused by it.
 */

/** A soft wash of the site's own primary blue, with its light-theme blue as a fallback should the token ever go. */
const TINT = 'color-mix(in srgb, var(--primary, #3b6fe0) 9%, transparent)';
const CLEAR = 'transparent';

/** How long the tint lingers once the reader has shown they are there. */
export const LINGER_AFTER_ACTIVITY_MS = 4_000;
/** How long before the tint clears even if the reader never moves. */
export const MAX_HOLD_MS = 5 * 60_000;
/** Input in the first moments after loading is the tail of what triggered it, not a sign of having looked. */
const SETTLE_MS = 600;

const ACTIVITY_EVENTS = ['pointermove', 'wheel', 'touchstart', 'keydown'] as const;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Batch {
  rows: HTMLElement[];
  animations: Animation[];
  controller: AbortController;
  timers: number[];
}

export class NewCommitHighlights {
  #batch: Batch | null = null;

  /** Whether any rows are tinted right now. */
  get isActive(): boolean {
    return this.#batch !== null;
  }

  /** Tints `rows` as new. Any earlier batch fades out first, so only the latest arrivals stand out. */
  mark(rows: readonly HTMLElement[]): void {
    this.#fadeOut(this.#batch, true);
    this.#batch = null;

    if (rows.length === 0) {
      return;
    }

    const reduced = prefersReducedMotion();
    const batch: Batch = {
      rows: [...rows],
      animations: rows.map((row) =>
        row.animate([{ backgroundColor: CLEAR }, { backgroundColor: TINT }], {
          duration: reduced ? 0 : 300,
          easing: 'ease-out',
          fill: 'forwards',
        }),
      ),
      controller: new AbortController(),
      timers: [],
    };

    this.#batch = batch;

    const linger = (): void => {
      batch.controller.abort();
      batch.timers.push(
        window.setTimeout(() => {
          this.#release(batch);
        }, LINGER_AFTER_ACTIVITY_MS),
      );
    };

    batch.timers.push(
      window.setTimeout(() => {
        for (const type of ACTIVITY_EVENTS) {
          window.addEventListener(
            type,
            (event) => {
              // Some browsers send a pointermove with no movement when the layout shifts under a still pointer.
              if (event instanceof PointerEvent && event.movementX === 0 && event.movementY === 0) {
                return;
              }

              linger();
            },
            { capture: true, passive: true, signal: batch.controller.signal },
          );
        }
      }, SETTLE_MS),
      window.setTimeout(() => {
        this.#release(batch);
      }, MAX_HOLD_MS),
    );
  }

  /** Removes every tint straight away, for when the feature is switched off or the page goes. */
  clear(): void {
    this.#fadeOut(this.#batch, true);
    this.#batch = null;
  }

  #release(batch: Batch): void {
    if (this.#batch !== batch) {
      return;
    }

    this.#batch = null;
    this.#fadeOut(batch, false);
  }

  #fadeOut(batch: Batch | null, quickly: boolean): void {
    if (batch === null) {
      return;
    }

    batch.controller.abort();
    batch.timers.forEach((timer) => {
      clearTimeout(timer);
    });

    const duration = quickly || prefersReducedMotion() ? 150 : 700;

    for (const row of batch.rows) {
      if (!row.isConnected) {
        continue;
      }

      const fade = row.animate([{ backgroundColor: TINT }, { backgroundColor: CLEAR }], {
        duration,
        easing: 'ease-in-out',
        fill: 'forwards',
      });

      fade.finished
        .catch(() => undefined)
        .finally(() => {
          fade.cancel();
        });
    }

    // The fade now covers the tint, so the holding animations can go.
    for (const animation of batch.animations) {
      animation.finished.catch(() => undefined);
      animation.cancel();
    }
  }
}
