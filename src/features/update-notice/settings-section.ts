import { el } from '@/core/dom';
import type { ExtensionState } from '@/core/extension-state';
import type { Settings, SettingsStore } from '@/core/settings';
import { isNewer, parseUpdateInfo, releasePage, UPDATE_KEY, type UpdateInfo } from '@/core/updates';
import type { SettingsSection } from '@/features/settings-page/sections';
import { createFeatureToggle } from '@/features/settings-page/toggle';

import { requestUpdateCheck } from './notice';

export interface UpdatesSectionOptions {
  store: SettingsStore<ExtensionState>;
  saveSettings: (settings: Settings) => Promise<void>;
  version: string;
  signal: AbortSignal;
}

export function updatesSection({ store, saveSettings, version, signal }: UpdatesSectionOptions): SettingsSection {
  return {
    id: 'updates',
    title: 'Updates',
    description:
      'New versions come from GitHub for now. With this on, /dev/null++ looks there once a day and says so at the top of the page when one is out. GitHub only sees that someone asked.',
    render: () => {
      const status = el('p', { className: 'note', attrs: { role: 'status' } });
      let info: UpdateInfo | null = null;
      const update = (): void => {
        if (!store.value.settings.features.updateNotice) {
          status.replaceChildren('Off. You will not hear about new versions here.');
        } else if (info?.latest != null && isNewer(info.latest, version)) {
          status.replaceChildren(
            `v${info.latest} is out, and you have v${version}. `,
            el('a', { attrs: { href: releasePage(info.latest), target: '_blank', rel: 'noopener noreferrer' } }, [
              'Get it on GitHub',
            ]),
          );
        } else if (info === null) {
          status.replaceChildren('Not checked yet.');
        } else {
          status.replaceChildren(`You have the latest, v${version}.`);
        }
      };
      const onChanged = (changes: Record<string, Browser.storage.StorageChange>, area: string): void => {
        if (area === 'local' && UPDATE_KEY in changes) {
          info = parseUpdateInfo(changes[UPDATE_KEY].newValue);
          update();
        }
      };

      browser.storage.onChanged.addListener(onChanged);
      signal.addEventListener(
        'abort',
        () => {
          browser.storage.onChanged.removeListener(onChanged);
        },
        { once: true },
      );
      void browser.storage.local.get(UPDATE_KEY).then((stored) => {
        info = parseUpdateInfo(stored[UPDATE_KEY]);
        update();
      });
      let on = store.value.settings.features.updateNotice;

      update();
      store.subscribe(() => {
        update();

        // Just turned on: look now, rather than on the next page.
        if (store.value.settings.features.updateNotice && !on) {
          requestUpdateCheck();
        }

        on = store.value.settings.features.updateNotice;
      }, signal);

      return el('div', { className: 'stack' }, [
        createFeatureToggle({ store, saveSettings, feature: 'updateNotice', label: 'Update notices', signal }),
        status,
      ]);
    },
  };
}
