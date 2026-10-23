import { watchFrameFailures } from '@/background/frame-failures';
import { complete } from '@/background/providers';
import { RateLimiter, rewrite } from '@/background/rewrite';
import { checkForUpdate, fetchLatestRelease, storedUpdate } from '@/background/updates';
import { readAiCredential } from '@/background/vault';
import type { RewriteResult } from '@/core/ai';
import { hasDataConsent } from '@/core/consent';
import { isSiteUrl, SITE_HOST_PERMISSION, SITE_MATCHES, SITE_ORIGIN } from '@/core/constants';
import { createLogger } from '@/core/logger';
import {
  isBackgroundMessage,
  isCheckUpdateMessage,
  isFromSiteContentScript,
  isThemePreviewMessage,
  type ContentMessage,
  type ThemePreviewMessage,
} from '@/core/messages';
import { SETTINGS_HASH } from '@/core/route';
import { readSettings } from '@/core/settings';

const logger = createLogger('background');

/** Built file names of the content scripts. WXT types these, so a renamed entrypoint fails to compile. */
const CONTENT_SCRIPTS = {
  hydrationProbe: '/content-scripts/hydration-probe.js',
  main: '/content-scripts/devnull.js',
  theme: '/content-scripts/theme.js',
} as const;

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
        // The theme first, so an updated extension puts it back before anything else.
        await browser.scripting.executeScript({ target: { tabId: id }, files: [CONTENT_SCRIPTS.theme] });
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

const SITE_ACCESS = { origins: [SITE_HOST_PERMISSION] };

/**
 * Firefox lets people switch an extension's access to a site off, and on some versions leaves it off at install. Without
 * it nothing runs on dev-null.sh, so the toolbar icon says so with a badge, and clicking it asks for access.
 */
async function showSiteAccess(): Promise<void> {
  const hasAccess = await browser.permissions.contains(SITE_ACCESS);

  await browser.action.setBadgeBackgroundColor({ color: '#d9480f' });
  await browser.action.setBadgeText({ text: hasAccess ? '' : '!' });
  await browser.action.setTitle({
    title: hasAccess ? '/dev/null++' : '/dev/null++ needs access to dev-null.sh. Click to allow it.',
  });
}

/**
 * At most this many rewrites a minute, whatever asks for them. Room for trying several presets in a row, but a stuck
 * button or a bug cannot run up the user's provider bill.
 */
const rewriteLimiter = new RateLimiter(30, 60_000);

/**
 * Handles messages from our content script. Anything not from our own content script in the top frame of a
 * dev-null.sh tab, or not exactly the shape we expect, is dropped without a reply.
 */
function onMessage(
  message: unknown,
  sender: Browser.runtime.MessageSender,
  sendResponse: (response: RewriteResult) => void,
): boolean {
  if (!isFromSiteContentScript(sender, browser.runtime.id)) {
    return false;
  }

  const tab = sender.tab?.id;

  // The theme editor's draft goes straight back to the theme script in the same tab's top frame, and nowhere else.
  if (isThemePreviewMessage(message) && tab !== undefined) {
    const preview: ThemePreviewMessage = { type: 'dnpp:theme-preview', theme: message.theme };

    browser.tabs.sendMessage(tab, preview, { frameId: 0 }).catch(() => {
      // The tab closed or navigated away; the draft went with it.
    });

    return false;
  }

  if (isCheckUpdateMessage(message)) {
    void (async () => {
      if ((await readSettings()).features.updateNotice) {
        await checkForUpdate({ now: Date.now, latestRelease: fetchLatestRelease, ...storedUpdate });
      }
    })().catch((error: unknown) => {
      logger.warn('Could not check for a new version.', error);
    });

    return false;
  }

  if (!isBackgroundMessage(message)) {
    return false;
  }

  void rewrite(
    { text: message.text, mode: message.mode, instruction: message.instruction, maxLength: message.maxLength },
    { readSettings, readCredential: readAiCredential, complete, limiter: rewriteLimiter, hasConsent: hasDataConsent },
  )
    .catch((error: unknown) => {
      logger.error('Rewrite failed.', error);

      return { ok: false, error: 'provider' } as const;
    })
    .then(sendResponse);

  // Keeps the channel open for the asynchronous reply.
  return true;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(onMessage);
  watchFrameFailures();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install' || reason === 'update') {
      void injectIntoOpenTabs();
    }
  });

  void showSiteAccess();
  browser.permissions.onRemoved.addListener(() => {
    void showSiteAccess();
  });
  browser.permissions.onAdded.addListener(({ origins = [] }) => {
    void showSiteAccess();

    // Access just given: start on the dev-null.sh tabs already open, as after installing.
    if (origins.includes(SITE_HOST_PERMISSION)) {
      void injectIntoOpenTabs();
    }
  });

  // The toolbar icon opens the settings page: in place on dev-null.sh, in a new tab from anywhere else.
  browser.action.onClicked.addListener((tab) => {
    // Firefox only lets a click ask for access while it is still being handled, so it asks first, every time. Already
    // given, the answer is yes without asking anything.
    const access = import.meta.env.FIREFOX ? browser.permissions.request(SITE_ACCESS) : Promise.resolve(true);

    void (async () => {
      if (!(await access.catch(() => false))) {
        return;
      }

      if (tab.id === undefined || tab.url === undefined || !isSiteUrl(tab.url)) {
        await browser.tabs.create({ url: `${SITE_ORIGIN}/${SETTINGS_HASH}` });

        return;
      }

      const message: ContentMessage = { type: 'dnpp:open-settings' };

      try {
        await browser.tabs.sendMessage(tab.id, message);
      } catch {
        // No content script listening yet, for example while the page is still loading. Changing only the fragment
        // does not reload the page, and the content script opens the page from the URL once it starts.
        const url = new URL(tab.url);

        url.hash = SETTINGS_HASH;
        await browser.tabs.update(tab.id, { url: url.href });
      }
    })();
  });
});
