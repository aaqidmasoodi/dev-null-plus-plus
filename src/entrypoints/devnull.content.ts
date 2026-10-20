import { HYDRATION_WAIT_TIMEOUT_MS, SITE_MATCHES } from '@/core/constants';
import { observeDom } from '@/core/dom';
import { waitForHydration } from '@/core/hydration';
import { createLogger } from '@/core/logger';
import { isContentMessage } from '@/core/messages';
import { isSettingsRoute, onRouteChange, openSettingsRoute, SETTINGS_HASH } from '@/core/route';
import { NavItem } from '@/features/nav-item/nav-item';
import { aboutSection } from '@/features/settings-page/sections';
import { SettingsPage } from '@/features/settings-page/settings-page';
import { removeTakeover } from '@/site/takeover';

const logger = createLogger('content');

export default defineContentScript({
  matches: SITE_MATCHES,
  runAt: 'document_idle',
  async main(ctx) {
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

    const navItem = new NavItem({ href: SETTINGS_HASH });
    const settingsPage = new SettingsPage({
      sections: [aboutSection(browser.runtime.getManifest().version)],
    });

    /** Brings everything in line with the URL and the DOM. Runs on every change of either, so it must stay cheap. */
    const sync = (): void => {
      try {
        const onSettings = isSettingsRoute();

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
    onRouteChange(sync, ctx.signal);

    const onMessage = (message: unknown): undefined => {
      if (isContentMessage(message)) {
        openSettingsRoute();
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
