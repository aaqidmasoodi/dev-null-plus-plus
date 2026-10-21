import { HYDRATION_WAIT_TIMEOUT_MS, isTopLevelSitePage, SITE_MATCHES } from '@/core/constants';
import { observeAttributes, observeDom } from '@/core/dom';
import { waitForHydration } from '@/core/hydration';
import { createLogger } from '@/core/logger';
import { parseRewriteResult } from '@/core/ai';
import { isContentMessage, isFromOwnBackground, type RewriteMessage } from '@/core/messages';
import { writeSettings, type SettingsStore } from '@/core/settings';
import { ComposerAi } from '@/features/ai-rewrite/composer-ai';
import { AutoLoadNewCommits } from '@/features/auto-load/auto-load';
import { autoLoadSection } from '@/features/auto-load/settings-section';
import { ImagePeek } from '@/features/image-peek/image-peek';
import { imagePeekSection } from '@/features/image-peek/settings-section';
import { PictureInPicture } from '@/features/pip/pip';
import { pipSection } from '@/features/pip/settings-section';
import { LinkLongPress } from '@/features/link-preview/long-press';
import { PreviewDialog } from '@/features/link-preview/preview-dialog';
import { linkPreviewSection } from '@/features/link-preview/settings-section';
import { aiSection } from '@/features/ai-rewrite/settings-section';
import { loadExtensionState, type ExtensionState } from '@/core/extension-state';
import {
  isSettingsRoute,
  moveSettingsRoute,
  onRouteChange,
  openSettingsRoute,
  SETTINGS_HASH,
  settingsHref,
} from '@/core/route';
import { NavItem } from '@/features/nav-item/nav-item';
import { SettingsNavigator } from '@/features/settings-page/navigator';
import { aboutSection } from '@/features/settings-page/sections';
import { SettingsPage } from '@/features/settings-page/settings-page';
import { Welcome } from '@/features/welcome/welcome';
import { WhoToFollowCards } from '@/features/who-to-follow/cards';
import { whoToFollowSection } from '@/features/who-to-follow/settings-section';
import { peekCandidate } from '@/site/images';
import { isPlainClick } from '@/site/navigate';
import { findHomePath, isFullScreenLayout, LAYOUT_ATTRIBUTES } from '@/site/selectors';
import { removeTakeover } from '@/site/takeover';

const logger = createLogger('content');

export default defineContentScript({
  matches: SITE_MATCHES,
  runAt: 'document_idle',
  async main(ctx) {
    if (!isTopLevelSitePage()) {
      return;
    }

    let hydration;

    try {
      hydration = await waitForHydration(ctx.signal, HYDRATION_WAIT_TIMEOUT_MS);
    } catch {
      // The extension was reloaded or updated while we waited. The new copy takes over.
      return;
    }

    if (hydration === 'timeout' || hydration === 'unknown') {
      logger.warn(`Could not confirm the page finished hydrating (${hydration}), starting anyway.`);
    }

    /**
     * Pages that fill the screen, like Remotes, have no room for the settings page, so there it opens on the log.
     * Returns the path to open it on, or `null` to open it in place.
     */
    const settingsElsewhere = (): string | null => (isFullScreenLayout() ? findHomePath() : null);
    const settingsNavigator = new SettingsNavigator();
    const openSettings = (): void => {
      const elsewhere = settingsElsewhere();

      if (elsewhere === null) {
        openSettingsRoute(null);
      } else {
        settingsNavigator.openOn(elsewhere);
      }
    };

    const navItem = new NavItem({
      href: SETTINGS_HASH,
      // In place, the link's own fragment does the job. Elsewhere, go through the site's router instead of a page load.
      onClick: (event) => {
        if (settingsElsewhere() !== null && isPlainClick(event)) {
          event.preventDefault();
          openSettings();
        }
      },
    });
    let store: SettingsStore<ExtensionState>;

    try {
      store = await loadExtensionState(ctx.signal);
    } catch (error) {
      logger.error('Could not read settings.', error);

      return;
    }

    // A short tour of what the extension adds, the first time the site opens after installing.
    const welcome = new Welcome({ onOpenSettings: openSettings, signal: ctx.signal });
    const settingsPage = new SettingsPage({
      sections: [
        aboutSection(browser.runtime.getManifest().version, () => {
          welcome.show();
        }),
        aiSection({
          store,
          saveSettings: writeSettings,
          frameUrl: browser.runtime.getURL('/vault.html'),
          signal: ctx.signal,
        }),
        autoLoadSection({ store, saveSettings: writeSettings, signal: ctx.signal }),
        linkPreviewSection({ store, saveSettings: writeSettings, signal: ctx.signal }),
        imagePeekSection({ store, saveSettings: writeSettings, signal: ctx.signal }),
        pipSection({ store, saveSettings: writeSettings, signal: ctx.signal }),
        whoToFollowSection({ store, saveSettings: writeSettings, signal: ctx.signal }),
      ],
    });
    const composerAi = new ComposerAi({
      store,
      request: async (request) =>
        // The reply is checked, not trusted: anything malformed counts as a failed rewrite.
        parseRewriteResult(
          await browser.runtime.sendMessage({ type: 'dnpp:ai-rewrite', ...request } satisfies RewriteMessage),
        ),
    });

    /** Keeps the composer's AI button in place. Separate from `sync`, so a failure here never touches navigation. */
    const syncComposer = (): void => {
      try {
        composerAi.ensure();
      } catch (error) {
        logger.error('Could not update the composer.', error);
      }
    };
    const autoLoad = new AutoLoadNewCommits({ store, signal: ctx.signal });
    // "Who to follow" as swipeable cards, following the site's own rows.
    const whoToFollow = new WhoToFollowCards({
      enabled: () => store.value.settings.features.whoToFollowCards,
      signal: ctx.signal,
    });
    /** Keeps the cards in step with the site's rows. Separate, so a failure here touches nothing else. */
    const syncWhoToFollow = (): void => {
      try {
        whoToFollow.ensure();
      } catch (error) {
        logger.error('Could not update the suggestions.', error);
      }
    };
    const preview = new PreviewDialog();
    const imagePeekOn = (): boolean => store.value.settings.features.imagePeek;

    // Press and hold an image to peek at it. Set up before link previews: an image inside a link peeks.
    const imagePeek = new ImagePeek({ enabled: () => imagePeekOn() && !preview.isOpen, signal: ctx.signal });

    // Keep a playing video going in a floating player while scrolling and browsing.
    const pip = new PictureInPicture({
      enabled: () => store.value.settings.features.pictureInPicture,
      automatic: () => store.value.settings.features.autoPictureInPicture,
      signal: ctx.signal,
    });

    // Press and hold an outside link to preview it. Read at each press, so switching it off takes effect at once.
    new LinkLongPress({
      enabled: () => store.value.settings.features.linkPreview && !preview.isOpen && !imagePeek.isPeeking,
      // A press on a picture is a peek, when that is on.
      ignore: (target) => imagePeekOn() && peekCandidate(target) !== null,
      onPress: () => {
        preview.prepare();
      },
      onGrow: (url, origin, duration) => {
        try {
          preview.grow(url, origin, duration);
        } catch (error) {
          logger.error('Could not open the preview.', error);
        }
      },
      onCancel: () => {
        preview.cancel();
      },
      onCommit: () => {
        preview.commit();
      },
      signal: ctx.signal,
    });
    store.subscribe(({ settings }) => {
      if (!settings.features.linkPreview) {
        preview.close();
      }

      pip.refresh();

      if (!settings.features.imagePeek) {
        imagePeek.destroy();
      }
    }, ctx.signal);
    /** Loads new commits when their pill appears. Also separate, so a failure here touches nothing else. */
    const syncAutoLoad = (): void => {
      try {
        autoLoad.ensure();
      } catch (error) {
        logger.error('Could not load new commits.', error);
      }
    };

    /** Brings everything in line with the URL and the DOM. Runs on every change of either, so it must stay cheap. */
    const sync = (): void => {
      syncComposer();
      syncAutoLoad();
      welcome.showIfPending();
      syncWhoToFollow();

      try {
        settingsNavigator.settle();

        const elsewhere = settingsElsewhere();
        const onSettings = isSettingsRoute();

        if (onSettings && elsewhere !== null) {
          moveSettingsRoute(elsewhere);

          return;
        }

        navItem.setHref(settingsHref(elsewhere));
        navItem.setActive(onSettings);
        settingsPage.setOpen(onSettings);
        navItem.ensure();
        settingsPage.ensure();
      } catch (error) {
        logger.error('Could not update the page.', error);
      }
    };

    sync();
    observeDom(sync, ctx.signal);
    welcome.start().catch((error: unknown) => {
      logger.error('Could not show the welcome.', error);
    });
    store.subscribe(() => {
      syncComposer();
      syncAutoLoad();
      syncWhoToFollow();
    }, ctx.signal);

    // Reaching the top of the log loads commits that were waiting, and coming back to the tab looks again. Scroll is
    // checked at most once a frame.
    let scrollFrame = 0;

    window.addEventListener(
      'scroll',
      () => {
        if (scrollFrame === 0) {
          scrollFrame = requestAnimationFrame(() => {
            scrollFrame = 0;
            syncAutoLoad();
          });
        }
      },
      { passive: true, signal: ctx.signal },
    );
    document.addEventListener('visibilitychange', syncAutoLoad, { signal: ctx.signal });
    observeAttributes(document.documentElement, LAYOUT_ATTRIBUTES, sync, ctx.signal);
    onRouteChange(sync, ctx.signal);

    const onMessage = (message: unknown, sender: Browser.runtime.MessageSender): undefined => {
      if (!isFromOwnBackground(sender, browser.runtime.id) || !isContentMessage(message)) {
        return undefined;
      }

      if (message.type === 'dnpp:open-settings') {
        openSettings();
      } else {
        // The preview checks the page is the one it is showing: other frames on the page are none of its business.
        preview.showFailure(message.url, message.reason);
      }

      return undefined;
    };

    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onMessage);
      navItem.destroy();
      settingsPage.destroy();
      composerAi.destroy();
      autoLoad.destroy();
      preview.destroy();
      imagePeek.destroy();
      pip.destroy();
      welcome.destroy();
      whoToFollow.destroy();
      removeTakeover();
    });

    logger.debug('Ready.', { hydration });
  },
});
