import type { ExtensionState } from '@/core/extension-state';
import type { Settings, SettingsStore } from '@/core/settings';
import type { SettingsSection } from '@/features/settings-page/sections';
import { createFeatureToggle } from '@/features/settings-page/toggle';

export interface ImagePeekSectionOptions {
  store: SettingsStore<ExtensionState>;
  saveSettings: (settings: Settings) => Promise<void>;
  signal: AbortSignal;
}

export function imagePeekSection({ store, saveSettings, signal }: ImagePeekSectionOptions): SettingsSection {
  return {
    id: 'image-peek',
    title: 'Image peek',
    description:
      'Press and hold an image to see it big. It grows out of the page while you hold, and goes back where it was when you let go. A normal click still opens it as usual.',
    render: () => createFeatureToggle({ store, saveSettings, feature: 'imagePeek', label: 'Image peek', signal }),
  };
}
