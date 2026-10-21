import type { ExtensionState } from '@/core/extension-state';
import type { Settings, SettingsStore } from '@/core/settings';
import type { SettingsSection } from '@/features/settings-page/sections';
import { createFeatureToggle } from '@/features/settings-page/toggle';

export interface WhoToFollowSectionOptions {
  store: SettingsStore<ExtensionState>;
  saveSettings: (settings: Settings) => Promise<void>;
  signal: AbortSignal;
}

export function whoToFollowSection({ store, saveSettings, signal }: WhoToFollowSectionOptions): SettingsSection {
  return {
    id: 'who-to-follow',
    title: 'Who to follow cards',
    description:
      'Who to follow as a stack of cards, each with a big picture. Swipe a card away when you are not interested, like its ✕, and someone new joins at the back. Follow right from the card.',
    render: () =>
      createFeatureToggle({ store, saveSettings, feature: 'whoToFollowCards', label: 'Who to follow cards', signal }),
  };
}
