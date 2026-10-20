import { el } from '@/core/dom';
import type { ExtensionState } from '@/core/extension-state';
import type { FeatureName, Settings, SettingsStore } from '@/core/settings';

export interface FeatureToggleOptions {
  store: SettingsStore<ExtensionState>;
  saveSettings: (settings: Settings) => Promise<void>;
  feature: FeatureName;
  /** What the switch is called for screen readers, usually the section's title. */
  label: string;
  signal: AbortSignal;
}

/**
 * An Off/On switch for one feature, like the site's own segmented controls (components/segmented-control.tsx). It
 * saves the choice and follows changes made anywhere, in this tab or another.
 */
export function createFeatureToggle({
  store,
  saveSettings,
  feature,
  label,
  signal,
}: FeatureToggleOptions): HTMLElement {
  const options = [
    { label: 'Off', value: false },
    { label: 'On', value: true },
  ] as const;
  const buttons = options.map(({ label: text, value }) => {
    const button = el('button', { attrs: { type: 'button', role: 'radio', 'data-feature': feature } }, [text]);

    button.addEventListener('click', () => {
      const current = store.value.settings;

      if (current.features[feature] !== value) {
        void saveSettings({ ...current, features: { ...current.features, [feature]: value } });
      }
    });

    return button;
  });
  const update = (): void => {
    const enabled = store.value.settings.features[feature];

    buttons.forEach((button, index) => {
      button.setAttribute('aria-checked', String(options[index]?.value === enabled));
    });
  };

  update();
  store.subscribe(update, signal);

  return el('div', { className: 'segmented', attrs: { role: 'radiogroup', 'aria-label': label } }, buttons);
}
