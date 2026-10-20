import type { ExtensionState } from '@/core/extension-state';
import type { Settings, SettingsStore } from '@/core/settings';
import type { SettingsSection } from '@/features/settings-page/sections';
import { createFeatureToggle } from '@/features/settings-page/toggle';

export interface LinkPreviewSectionOptions {
  store: SettingsStore<ExtensionState>;
  saveSettings: (settings: Settings) => Promise<void>;
  signal: AbortSignal;
}

export function linkPreviewSection({ store, saveSettings, signal }: LinkPreviewSectionOptions): SettingsSection {
  return {
    id: 'link-preview',
    title: 'Link preview',
    description:
      'Press and hold a link to open it in a large window over your log, without leaving it. Pages open like a private window: they get none of your cookies or logins, and keep nothing once closed. A normal click still opens the link as usual.',
    render: () => createFeatureToggle({ store, saveSettings, feature: 'linkPreview', label: 'Link preview', signal }),
  };
}
