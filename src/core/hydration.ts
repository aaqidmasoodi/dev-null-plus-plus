import { HYDRATION_ATTRIBUTE, type HydrationState } from './constants';

const STATES: readonly HydrationState[] = ['hydrated', 'client-rendered', 'unknown', 'timeout'];

function isHydrationState(value: string | null): value is HydrationState {
  return value !== null && (STATES as readonly string[]).includes(value);
}

function readState(): HydrationState | null {
  const value = document.documentElement.getAttribute(HYDRATION_ATTRIBUTE);

  return isHydrationState(value) ? value : null;
}

/**
 * Resolves once React has finished hydrating dev-null.sh's server-rendered page, as reported by the main-world probe.
 *
 * Adding a node inside a React tree before hydration commits makes React see markup it did not render. React then
 * throws a hydration mismatch and re-renders the whole page from scratch, which flickers and logs errors. Waiting first
 * keeps the extension invisible to the site.
 *
 * Resolves with `'timeout'` if the probe never reports, for example if it was blocked, so the extension still runs.
 * Rejects with the signal's reason if `signal` aborts first.
 */
export function waitForHydration(signal: AbortSignal, timeoutMs: number): Promise<HydrationState> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);

      return;
    }

    const current = readState();

    if (current !== null) {
      resolve(current);

      return;
    }

    const finish = (): void => {
      observer.disconnect();
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      finish();
      reject(signal.reason as Error);
    };
    const observer = new MutationObserver(() => {
      const state = readState();

      if (state !== null) {
        finish();
        resolve(state);
      }
    });
    const timeout = setTimeout(() => {
      finish();
      resolve('timeout');
    }, timeoutMs);

    observer.observe(document.documentElement, { attributes: true, attributeFilter: [HYDRATION_ATTRIBUTE] });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
