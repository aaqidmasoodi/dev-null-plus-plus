import { HYDRATION_WAIT_TIMEOUT_MS, SITE_MATCHES } from '@/core/constants';
import { observeDom } from '@/core/dom';
import { waitForHydration } from '@/core/hydration';
import { createLogger } from '@/core/logger';
import { isContentMessage } from '@/core/messages';
import { NavItem } from '@/features/nav-item/nav-item';
import { Panel } from '@/features/panel/panel';

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

    const panel = new Panel({
      version: browser.runtime.getManifest().version,
      onOpenChange: (open) => {
        navItem.setExpanded(open);
      },
    });
    const navItem = new NavItem({
      onActivate: () => {
        panel.toggle();
      },
    });
    const ensureNavItem = (): void => {
      try {
        navItem.ensure();
      } catch (error) {
        logger.error('Could not place the navigation item.', error);
      }
    };

    ensureNavItem();
    observeDom(ensureNavItem, ctx.signal);

    const onMessage = (message: unknown): undefined => {
      if (isContentMessage(message)) {
        panel.toggle();
      }

      return undefined;
    };

    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onMessage);
      navItem.destroy();
      panel.destroy();
    });

    logger.debug('Ready.', { hydration });
  },
});
