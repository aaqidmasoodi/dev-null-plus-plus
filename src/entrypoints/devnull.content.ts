import { HYDRATION_WAIT_TIMEOUT_MS, isTopLevelSitePage, SITE_MATCHES } from '@/core/constants';
import { observeAttributes, observeDom } from '@/core/dom';
import { waitForHydration } from '@/core/hydration';
import { createLogger } from '@/core/logger';
import { isContentMessage, isFromOwnBackground } from '@/core/messages';
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
    const settingsPage = new SettingsPage({
      sections: [aboutSection(browser.runtime.getManifest().version)],
    });

    /** Brings everything in line with the URL and the DOM. Runs on every change of either, so it must stay cheap. */
    const sync = (): void => {
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
    observeAttributes(document.documentElement, LAYOUT_ATTRIBUTES, sync, ctx.signal);
    onRouteChange(sync, ctx.signal);

    const onMessage = (message: unknown, sender: Browser.runtime.MessageSender): undefined => {
      if (isFromOwnBackground(sender, browser.runtime.id) && isContentMessage(message)) {
        openSettings();
      }

      return undefined;
    };

    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onMessage);
      navItem.destroy();
      settingsPage.destroy();
      removeTakeover();
    });

    logger.debug('Ready.', { hydration });
  },
});
