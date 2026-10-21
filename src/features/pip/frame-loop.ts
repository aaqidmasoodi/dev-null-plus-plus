/**
 * Runs `step` once per animation frame while it says there is more to do, and sleeps otherwise until woken. However
 * often it is woken, even from inside a frame, exactly one frame is ever waiting, and once stopped it never runs again.
 * From dev-null.sh pull request #686 (resources/js/lib/frame-loop.ts).
 */
export interface FrameLoop {
  wake: () => void;
  stop: () => void;
}

export function createFrameLoop(step: (now: number, isWaking: boolean) => boolean): FrameLoop {
  let frame: number | null = null;
  let isRunning = false;
  let isStopped = false;

  const wake = (): void => {
    if (!isStopped && frame === null) {
      frame = requestAnimationFrame(run);
    }
  };

  function run(now: number): void {
    frame = null;

    if (isStopped) {
      return;
    }

    const isWaking = !isRunning;

    isRunning = step(now, isWaking);

    if (isRunning) {
      wake();
    }
  }

  return {
    wake,
    stop: () => {
      isStopped = true;

      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    },
  };
}
