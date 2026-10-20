import { el } from '@/core/dom';
import type { Settings, SettingsStore } from '@/core/settings';
import type { SettingsSection } from '@/features/settings-page/sections';

import type { ExtensionState } from './state';

export interface AiSectionOptions {
  store: SettingsStore<ExtensionState>;
  saveSettings: (settings: Settings) => Promise<void>;
  /** Where the provider frame loads from. A per-session extension URL, from `browser.runtime.getURL`. */
  frameUrl: string;
  signal: AbortSignal;
}

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

/**
 * The "Rewrite with AI" block: an on/off switch for the composer button, and the provider frame where the key is
 * entered. The frame is an extension page, so dev-null.sh's scripts never see the key.
 */
export function aiSection({ store, saveSettings, frameUrl, signal }: AiSectionOptions): SettingsSection {
  return {
    id: 'ai-rewrite',
    title: 'Rewrite with AI',
    description:
      'A button in the composer that rewrites your draft with the AI provider you choose. Your key stays in this browser, and your draft is only sent when you ask for a rewrite.',
    render: () => {
      const options: { label: string; value: boolean }[] = [
        { label: 'Off', value: false },
        { label: 'On', value: true },
      ];
      const buttons = options.map(({ label, value }) => {
        const button = el('button', { attrs: { type: 'button', role: 'radio' } }, [label]);

        button.addEventListener('click', () => {
          const current = store.value.settings;

          if (current.features.aiRewrite !== value) {
            void saveSettings({ ...current, features: { ...current.features, aiRewrite: value } });
          }
        });

        return button;
      });
      const toggle = el(
        'div',
        { className: 'segmented', attrs: { role: 'radiogroup', 'aria-label': 'Rewrite with AI' } },
        buttons,
      );
      const frame = el('iframe', {
        className: 'frame',
        attrs: { title: 'AI provider', referrerpolicy: 'no-referrer' },
      });
      let theme: boolean | null = null;

      const update = (): void => {
        const enabled = store.value.settings.features.aiRewrite;

        buttons.forEach((button, index) => {
          button.setAttribute('aria-checked', String(options[index]?.value === enabled));
        });
        frame.hidden = !enabled;

        // Load the frame in the site's current theme. Only reload it when the theme actually changed.
        const dark = isDarkTheme();

        if (enabled && dark !== theme) {
          theme = dark;
          frame.src = `${frameUrl}?theme=${dark ? 'dark' : 'light'}`;
        }
      };

      update();
      store.subscribe(update, signal);

      const observer = new MutationObserver(update);

      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      signal.addEventListener(
        'abort',
        () => {
          observer.disconnect();
        },
        { once: true },
      );

      return el('div', { className: 'stack' }, [toggle, frame]);
    },
  };
}
