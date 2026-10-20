import {
  HYDRATION_ATTRIBUTE,
  HYDRATION_PROBE_TIMEOUT_MS,
  isTopLevelSitePage,
  SITE_MATCHES,
  type HydrationState,
} from '@/core/constants';
import { readRootHydration } from '@/core/react-hydration';
import { SELECTORS } from '@/site/selectors';

const POLL_INTERVAL_MS = 50;

/**
 * Runs in the page's main world and tells the isolated content script when React has finished hydrating, by setting
 * {@link HYDRATION_ATTRIBUTE} on `<html>`. It reads, never writes, React's state, and stops as soon as it has an answer.
 *
 * It polls with timers rather than animation frames, because frames do not run in background tabs and a tab opened in
 * the background should be ready by the time it is looked at.
 */
export default defineContentScript({
  matches: SITE_MATCHES,
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    if (!isTopLevelSitePage()) {
      return;
    }

    const root = document.documentElement;

    if (root.hasAttribute(HYDRATION_ATTRIBUTE)) {
      return;
    }

    const report = (state: HydrationState): void => {
      root.setAttribute(HYDRATION_ATTRIBUTE, state);
    };
    const startedAt = performance.now();
    const check = (): void => {
      const hydration = readRootHydration(document.querySelector(SELECTORS.appRoot));

      if (hydration !== 'pending') {
        report(hydration);

        return;
      }

      if (performance.now() - startedAt >= HYDRATION_PROBE_TIMEOUT_MS) {
        report('timeout');

        return;
      }

      setTimeout(check, POLL_INTERVAL_MS);
    };

    check();
  },
});
