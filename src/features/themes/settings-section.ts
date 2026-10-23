import { el } from '@/core/dom';
import type { ExtensionState } from '@/core/extension-state';
import type { Settings, SettingsStore } from '@/core/settings';
import type { SettingsSection } from '@/features/settings-page/sections';
import { createFeatureToggle } from '@/features/settings-page/toggle';
import { rgbChannels } from '@/themes/color';
import { CUSTOM_THEME_ID } from '@/themes/custom';
import { PRESETS } from '@/themes/presets';
import type { Palette, Scheme, Shadow, ThemeDefinition } from '@/themes/schema';

export interface ThemesSectionOptions {
  store: SettingsStore<ExtensionState>;
  saveSettings: (settings: Settings) => Promise<void>;
  /** Opens the theme editor, on this page. */
  openEditor: () => void;
  signal: AbortSignal;
}

function previewShadow(shadow: Shadow, palette: Palette): string {
  switch (shadow.kind) {
    case 'none':
      return 'none';
    case 'soft':
      return `0 ${String(Math.round(shadow.y / 2))}px ${String(Math.round(shadow.blur / 2))}px rgb(${rgbChannels(palette.ink)} / ${String(shadow.opacity)})`;
    case 'hard':
      return `${String(Math.ceil(shadow.x / 2))}px ${String(Math.ceil(shadow.y / 2))}px 0 ${palette.ink}`;
  }
}

/**
 * A theme drawn small, with its own colours: its backdrop, and a card on it with a line of text, a muted line and a
 * button. Only checked hex colours and numbers go into the style, through custom properties.
 */
function paintPreview(preview: HTMLElement, theme: ThemeDefinition, scheme: Scheme): void {
  const palette = theme.palettes[scheme];
  const stops = palette.backdrop.length > 1 ? palette.backdrop : [palette.backdrop[0], palette.backdrop[0]];
  const properties: Record<string, string> = {
    '--preview-backdrop': `linear-gradient(180deg, ${stops.join(', ')})`,
    '--preview-card': palette.card,
    '--preview-text': palette.cardForeground,
    '--preview-muted': palette.mutedForeground,
    '--preview-primary': palette.primary,
    '--preview-on-primary': palette.primaryForeground,
    '--preview-border': palette.border,
    '--preview-border-width': `${String(Math.min(theme.shape.border, 3))}px`,
    '--preview-radius': `${String(Math.round(theme.shape.radius / 2))}px`,
    '--preview-button-radius':
      theme.motifs.controls === 'pill' ? '999px' : `${String(Math.round(theme.shape.radius / 2))}px`,
    '--preview-shadow': previewShadow(theme.depth.card, palette),
    '--preview-chrome': `linear-gradient(90deg, ${palette.chromeStart}, ${palette.chromeEnd})`,
  };

  for (const [name, value] of Object.entries(properties)) {
    preview.style.setProperty(name, value);
  }

  preview.dataset.post = theme.motifs.post;
}

function themeButton(theme: ThemeDefinition): { button: HTMLButtonElement; preview: HTMLElement; name: HTMLElement } {
  const preview = el('span', { className: 'theme-preview', attrs: { 'aria-hidden': 'true' } }, [
    el('span', { className: 'theme-card' }, [
      el('span', { className: 'theme-bar' }),
      el('span', { className: 'theme-line' }),
      el('span', { className: 'theme-line theme-line-muted' }),
      el('span', { className: 'theme-button' }),
    ]),
  ]);
  const name = el('span', { className: 'theme-name' }, [theme.name]);
  const button = el(
    'button',
    { className: 'theme', attrs: { type: 'button', role: 'radio', 'data-theme': theme.id } },
    [preview, name, el('span', { className: 'theme-tagline' }, [theme.tagline])],
  );

  return { button, preview, name };
}

export function themesSection({ store, saveSettings, openEditor, signal }: ThemesSectionOptions): SettingsSection {
  return {
    id: 'themes',
    title: 'Themes',
    description:
      'Restyle all of /dev/null, with one of these or one you make yourself. Each follows the site’s own light or dark setting, under Settings, Appearance.',
    render: () => {
      const previews = new Map<ThemeDefinition, HTMLElement>();
      const scheme = (): Scheme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
      const buttons = PRESETS.map((theme) => {
        const { button, preview } = themeButton(theme);

        previews.set(theme, preview);
        button.addEventListener('click', () => {
          const current = store.value.settings;

          // Picking a theme turns themes on.
          if (!current.features.themes || current.theme.preset !== theme.id) {
            void saveSettings({
              ...current,
              features: { ...current.features, themes: true },
              theme: { ...current.theme, preset: theme.id },
            });
          }
        });

        return button;
      });
      // The user's own theme, once there is one: drawn and picked like the presets.
      const custom = themeButton({
        ...PRESETS[0],
        id: CUSTOM_THEME_ID,
        name: 'Your theme',
        tagline: 'Your own theme.',
      });

      custom.button.addEventListener('click', () => {
        const current = store.value.settings;

        if (current.theme.custom !== null && (!current.features.themes || current.theme.preset !== CUSTOM_THEME_ID)) {
          void saveSettings({
            ...current,
            features: { ...current.features, themes: true },
            theme: { ...current.theme, preset: CUSTOM_THEME_ID },
          });
        }
      });

      const grid = el('div', { className: 'themes', attrs: { role: 'radiogroup', 'aria-label': 'Theme' } }, [
        ...buttons,
        custom.button,
      ]);
      const edit = el('button', { className: 'button', attrs: { type: 'button', 'data-action': 'edit-theme' } });

      edit.addEventListener('click', () => {
        openEditor();
      });

      const brush = el('div', { className: 'option' }, [
        el('div', {}, [
          el('h3', {}, ['Brush button']),
          el('p', {}, ['A brush on the left edge of every page, to open the theme editor from anywhere.']),
        ]),
        createFeatureToggle({ store, saveSettings, feature: 'themeBrush', label: 'Brush button', signal }),
      ]);
      const update = (): void => {
        const { features, theme } = store.value.settings;

        grid.toggleAttribute('data-off', !features.themes);
        buttons.forEach((button, index) => {
          button.setAttribute('aria-checked', String(features.themes && PRESETS[index]?.id === theme.preset));
        });
        custom.button.hidden = theme.custom === null;
        custom.button.setAttribute('aria-checked', String(features.themes && theme.preset === CUSTOM_THEME_ID));
        custom.name.textContent = theme.custom?.name ?? '';
        edit.textContent = theme.custom === null ? 'Make your own theme' : 'Edit your theme';
        brush.hidden = !features.themes;
        repaint();
      };
      const repaint = (): void => {
        for (const [theme, preview] of previews) {
          paintPreview(preview, theme, scheme());
        }

        const own = store.value.settings.theme.custom;

        if (own !== null) {
          paintPreview(custom.preview, own, scheme());
        }
      };

      update();
      store.subscribe(update, signal);

      // The previews follow the site switching between light and dark.
      const observer = new MutationObserver(repaint);

      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      signal.addEventListener(
        'abort',
        () => {
          observer.disconnect();
        },
        { once: true },
      );

      return el('div', { className: 'stack' }, [
        createFeatureToggle({ store, saveSettings, feature: 'themes', label: 'Themes', signal }),
        grid,
        el('div', {}, [edit]),
        brush,
      ]);
    },
  };
}
