import { isSiteUrl } from '@/core/constants';
import { createLogger } from '@/core/logger';
import { MAX_FRAME_URL_LENGTH, type FrameFailedMessage } from '@/core/messages';

const logger = createLogger('frame-failures');

/** What the browser reports when a page refuses to be framed (`X-Frame-Options`, CSP `frame-ancestors`). */
const REFUSED = 'net::ERR_BLOCKED_BY_RESPONSE';
/** Reported when we leave a page ourselves, such as closing the preview mid-load. Not a failure. */
const ABORTED = 'net::ERR_ABORTED';

/** The parts of a `webNavigation.onErrorOccurred` event this reads. */
export interface FrameError {
  tabId: number;
  frameId: number;
  parentFrameId: number;
  error: string;
  url: string;
}

/**
 * Turns a navigation error into a notice for the tab, or `null` if it is not ours to report. Only frames placed
 * directly in a dev-null.sh page count, which is where the preview's frame lives: never a tab's own page, and never
 * frames on any other site. `topUrl` is the address of the tab's top frame.
 */
export function frameFailure(details: FrameError, topUrl: string | undefined): FrameFailedMessage | null {
  if (
    details.frameId <= 0 ||
    details.parentFrameId !== 0 ||
    details.error === ABORTED ||
    !isSiteUrl(topUrl) ||
    !details.url.startsWith('https://') ||
    details.url.length > MAX_FRAME_URL_LENGTH
  ) {
    return null;
  }

  return {
    type: 'dnpp:frame-failed',
    url: details.url,
    reason: details.error === REFUSED ? 'refused' : 'failed',
  };
}

/**
 * Tells dev-null.sh tabs when a page in one of their frames could not be shown, so a link preview can say so plainly
 * instead of showing the browser's error page. The tab's content script decides whether the frame is its preview.
 */
export function watchFrameFailures(): void {
  browser.webNavigation.onErrorOccurred.addListener((details) => {
    // Cheap checks first, so frames elsewhere cost nothing.
    if (details.frameId <= 0 || details.parentFrameId !== 0) {
      return;
    }

    void (async () => {
      try {
        const top = await browser.webNavigation.getFrame({ tabId: details.tabId, frameId: 0 });
        const message = frameFailure(details, top?.url);

        if (message !== null) {
          await browser.tabs.sendMessage(details.tabId, message, { frameId: 0 });
        }
      } catch (error) {
        // The tab may have closed, or have no content script yet. Nothing to tell.
        logger.warn('Could not report a frame failure.', error);
      }
    })();
  });
}
