import type { ExtensionState } from '@/core/extension-state';
import type { Settings, SettingsStore } from '@/core/settings';
import type { SettingsSection } from '@/features/settings-page/sections';
import { createFeatureToggle } from '@/features/settings-page/toggle';

export interface AutoLoadSectionOptions {
  store: SettingsStore<ExtensionState>;
  saveSettings: (settings: Settings) => Promise<void>;
  signal: AbortSignal;
}

export function autoLoadSection({ store, saveSettings, signal }: AutoLoadSectionOptions): SettingsSection {
  return {
    id: 'auto-load-new-commits',
    title: 'Load new commits automatically',
    description:
      'When the "new commits" pill appears on your log, they load on their own. Only while you are at the top, so you never lose your place: further down, the pill waits until you scroll back up.',
    render: () =>
      createFeatureToggle({
        store,
        saveSettings,
        feature: 'autoLoadNewCommits',
        label: 'Load new commits automatically',
        signal,
      }),
  };
}
