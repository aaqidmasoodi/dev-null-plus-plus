import { isTopLevelSitePage, SITE_MATCHES } from '@/core/constants';
import { createLogger } from '@/core/logger';
import { parseSettings, readSettings, SETTINGS_KEY } from '@/core/settings';
import { choiceFromSettings, readCachedChoice, ThemeRuntime, writeCachedChoice } from '@/themes/runtime';

const logger = createLogger('theme');

/**
 * Themes, from before the first paint. The cached choice goes on at once, so a themed page is never drawn in the site's
 * own look first; then the extension's storage, which is the truth, confirms or corrects it, and every change after
 * that applies straight away, in every open tab.
 *
 * Kept apart from the main content script, so the two never take each other down.
 */
export default defineContentScript({
  matches: SITE_MATCHES,
  runAt: 'document_start',
  async main(ctx) {
    if (!isTopLevelSitePage()) {
      return;
    }

    const runtime = new ThemeRuntime();
    const apply = (settings: unknown): void => {
      const choice = choiceFromSettings(parseSettings(settings));

      try {
        runtime.apply(choice);
      } catch (error) {
        // A theme that cannot be drawn leaves the site as it is, rather than half themed.
        logger.error('Could not apply the theme.', error);
        runtime.apply(null);
      }

      writeCachedChoice(runtime.applied);
    };

    try {
      runtime.apply(readCachedChoice());
    } catch (error) {
      logger.error('Could not apply the cached theme.', error);
      runtime.apply(null);
    }

    if (document.readyState === 'loading') {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          runtime.settle();
        },
        { once: true, signal: ctx.signal },
      );
    }

    const onChanged = (changes: Record<string, Browser.storage.StorageChange>, area: string): void => {
      const change: Browser.storage.StorageChange | undefined = changes[SETTINGS_KEY];

      if (area === 'local' && change !== undefined) {
        apply(change.newValue);
      }
    };

    browser.storage.onChanged.addListener(onChanged);
    // Taken off with this copy of the extension: when it is turned off or removed, the site's own look comes back. An
    // update injects the new copy into open tabs at once (see background.ts).
    ctx.onInvalidated(() => {
      browser.storage.onChanged.removeListener(onChanged);
      runtime.apply(null);
    });

    let settings;

    try {
      settings = await readSettings();
    } catch (error) {
      // The extension was reloaded or removed while reading. The cached theme stays until the new copy takes over.
      logger.warn('Could not read the theme setting.', error);

      return;
    }

    apply(settings);
  },
});
