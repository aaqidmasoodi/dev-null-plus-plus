import { SITE_MATCHES, SITE_ORIGIN } from '@/core/constants';
import { createLogger } from '@/core/logger';
import type { ContentMessage } from '@/core/messages';

const logger = createLogger('background');

/** Built file names of the content scripts. WXT types these, so a renamed entrypoint fails to compile. */
const CONTENT_SCRIPTS = {
  hydrationProbe: '/content-scripts/hydration-probe.js',
  main: '/content-scripts/devnull.js',
} as const;

function isSiteUrl(url: string | undefined): boolean {
  return url !== undefined && new URL(url).origin === SITE_ORIGIN;
}

/**
 * Chrome only runs manifest content scripts on pages loaded after the extension is installed. Inject into dev-null.sh
 * tabs that are already open, so installing or updating takes effect without a reload.
 */
async function injectIntoOpenTabs(): Promise<void> {
  const tabs = await browser.tabs.query({ url: SITE_MATCHES });

  await Promise.allSettled(
    tabs.map(async ({ id, discarded }) => {
      if (id === undefined || discarded) {
        return;
      }

      try {
        await browser.scripting.executeScript({
          target: { tabId: id },
          files: [CONTENT_SCRIPTS.hydrationProbe],
          world: 'MAIN',
        });
        await browser.scripting.executeScript({ target: { tabId: id }, files: [CONTENT_SCRIPTS.main] });
      } catch (error) {
        // Tabs can close or navigate away mid-injection. They pick the scripts up on their next load.
        logger.warn(`Could not inject into tab ${id}.`, error);
      }
    }),
  );
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install' || reason === 'update') {
      void injectIntoOpenTabs();
    }
  });

  // The toolbar icon opens the panel on dev-null.sh, and takes you there from anywhere else.
  browser.action.onClicked.addListener((tab) => {
    void (async () => {
      if (tab.id !== undefined && isSiteUrl(tab.url)) {
        const message: ContentMessage = { type: 'dnpp:toggle-panel' };

        try {
          await browser.tabs.sendMessage(tab.id, message);

          return;
        } catch (error) {
          // No content script listening yet, for example while the page is still loading.
          logger.warn('Could not reach the page.', error);

          return;
        }
      }

      await browser.tabs.create({ url: `${SITE_ORIGIN}/` });
    })();
  });
});
