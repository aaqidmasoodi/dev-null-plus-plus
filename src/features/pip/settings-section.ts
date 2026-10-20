import { el } from '@/core/dom';
import type { ExtensionState } from '@/core/extension-state';
import type { Settings, SettingsStore } from '@/core/settings';
import type { SettingsSection } from '@/features/settings-page/sections';
import { createFeatureToggle } from '@/features/settings-page/toggle';

export interface PipSectionOptions {
  store: SettingsStore<ExtensionState>;
  saveSettings: (settings: Settings) => Promise<void>;
  signal: AbortSignal;
}

export function pipSection({ store, saveSettings, signal }: PipSectionOptions): SettingsSection {
  return {
    id: 'picture-in-picture',
    title: 'Picture-in-picture',
    description:
      'Keep a video playing in a floating player while you scroll and browse. Pop it out with the picture-in-picture button under the video and it stays out on every page until you play it here or close it. With Automatic on, a playing video also floats by itself when you scroll past it or leave its page, and comes back when you return.',
    render: () =>
      el('div', { className: 'stack' }, [
        createFeatureToggle({ store, saveSettings, feature: 'pictureInPicture', label: 'Picture-in-picture', signal }),
        createFeatureToggle({
          store,
          saveSettings,
          feature: 'autoPictureInPicture',
          label: 'Automatic picture-in-picture',
          signal,
        }),
      ]),
  };
}
