import { afterEach, describe, expect, it } from 'vitest';

import { isThemePreviewMessage } from '@/core/messages';
import { DEFAULT_SETTINGS, parseSettings } from '@/core/settings';
import { contrast, type Hex } from '@/themes/color';
import { contrastIssues } from '@/themes/contrast';
import {
  CUSTOM_THEME_ID,
  customFrom,
  exportTheme,
  importTheme,
  KEY_COLOURS,
  MAX_THEME_JSON,
  parseCustomTheme,
  readable,
} from '@/themes/custom';
import { PRESETS } from '@/themes/presets';
import { CUSTOM_CACHE_KEY, readCachedChoice, THEME_CACHE_KEY, writeCachedChoice } from '@/themes/runtime';
import { validateTheme } from '@/themes/validate';

const mine = customFrom(PRESETS[1], 'Mine');

describe('the user’s own theme', () => {
  it('is a copy of a theme under the one custom id, valid as it is', () => {
    expect(mine.id).toBe(CUSTOM_THEME_ID);
    expect(mine.name).toBe('Mine');
    expect(validateTheme(mine).ok).toBe(true);
    // A copy: changing it leaves the preset alone.
    (mine.palettes.light as { primary: Hex }).primary = '#123456';
    expect(PRESETS[1].palettes.light.primary).not.toBe('#123456');
  });

  it('is only read back when it is valid and has the custom id', () => {
    expect(parseCustomTheme(customFrom(PRESETS[0]))).not.toBeNull();
    expect(parseCustomTheme(PRESETS[0])).toBeNull();
    expect(parseCustomTheme({ ...customFrom(PRESETS[0]), css: 'body{}' })).toBeNull();
    expect(parseCustomTheme('custom')).toBeNull();
  });

  it('imports any valid theme as JSON, and explains what is wrong with the rest', () => {
    const imported = importTheme(JSON.stringify(PRESETS[4]));

    expect(imported.ok && imported.theme.id).toBe(CUSTOM_THEME_ID);
    expect(importTheme(exportTheme(customFrom(PRESETS[2]))).ok).toBe(true);
    expect(importTheme('not json')).toEqual({ ok: false, errors: ['That is not JSON.'] });
    expect(importTheme(' '.repeat(MAX_THEME_JSON + 1)).ok).toBe(false);

    const broken = importTheme(JSON.stringify({ ...PRESETS[0], shape: { radius: 999, border: 1 } }));

    expect(broken.ok).toBe(false);
    expect(broken.ok ? [] : broken.errors).toContain('theme.shape.radius must be a number from 0 to 28');
  });
});

describe('colours the editor works out', () => {
  it('keeps a colour that already reads well', () => {
    expect(readable('#000000', ['#ffffff'])).toBe('#000000');
  });

  it('moves one that does not until it does, on every background', () => {
    const colour = readable('#999999', ['#ffffff', '#f0f0f0']);

    expect(contrast(colour, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colour, '#f0f0f0')).toBeGreaterThanOrEqual(4.5);
  });

  const picks: Hex[] = ['#000000', '#ffffff', '#ff00aa', '#00ff66', '#1e90ff', '#808080', '#ffe600', '#3b0a45'];

  describe.each(PRESETS.map((preset) => [preset.name, preset] as const))('starting from %s', (_, preset) => {
    it.each(KEY_COLOURS.map((key) => [key.label, key] as const))(
      'setting %s to anything keeps the theme valid',
      (__, key) => {
        for (const colour of picks) {
          const palette = key.write(preset.palettes.light, colour);

          expect(key.read(palette)).toBe(colour);
          expect(validateTheme({ ...customFrom(preset), palettes: { ...preset.palettes, light: palette } }).ok).toBe(
            true,
          );
        }
      },
    );

    it('only ever leaves the colours the user picked hard to read', () => {
      const picked = new Set(['Text on the page', 'Text on cards', 'Accent text on cards', 'Accent text on the page']);
      const worked = ['Card text', 'Menu text', 'Text on secondary', 'Text on hover', 'Text on the accent'];

      for (const colour of picks) {
        let palette = preset.palettes.light;

        for (const key of KEY_COLOURS) {
          palette = key.write(palette, colour);
        }

        const issues = contrastIssues(palette).map(({ label }) => label);

        for (const label of worked) {
          // Everything on one colour cannot be fixed by moving the text alone, unless the text is what moves.
          if (!picked.has(label)) {
            expect(issues).not.toContain(label);
          }
        }
      }
    });
  });
});

describe('settings with the user’s own theme', () => {
  it('keeps a valid one and picks it', () => {
    const custom = customFrom(PRESETS[3]);
    const settings = parseSettings({ features: { themes: true }, theme: { preset: 'custom', custom } });

    expect(settings.theme).toEqual({ preset: 'custom', custom });
  });

  it('falls back to the default when the custom one is missing or tampered with', () => {
    expect(parseSettings({ theme: { preset: 'custom' } }).theme).toEqual(DEFAULT_SETTINGS.theme);
    expect(
      parseSettings({ theme: { preset: 'custom', custom: { ...customFrom(PRESETS[0]), id: 'neo-tokyo' } } }).theme,
    ).toEqual(DEFAULT_SETTINGS.theme);
  });

  it('keeps a saved custom theme while a preset is picked', () => {
    const custom = customFrom(PRESETS[0]);

    expect(parseSettings({ theme: { preset: 'retro-os', custom } }).theme).toEqual({ preset: 'retro-os', custom });
  });
});

describe('the editor’s preview message', () => {
  it('carries a valid custom theme, or null', () => {
    expect(isThemePreviewMessage({ type: 'dnpp:theme-preview', theme: null })).toBe(true);
    expect(isThemePreviewMessage({ type: 'dnpp:theme-preview', theme: customFrom(PRESETS[0]) })).toBe(true);
  });

  it('carries nothing else', () => {
    expect(isThemePreviewMessage({ type: 'dnpp:theme-preview', theme: PRESETS[0] })).toBe(false);
    expect(isThemePreviewMessage({ type: 'dnpp:theme-preview', theme: { id: 'custom' } })).toBe(false);
    expect(isThemePreviewMessage({ type: 'dnpp:theme-preview', theme: null, css: 'x' })).toBe(false);
    expect(isThemePreviewMessage({ type: 'dnpp:theme-preview' })).toBe(false);
    expect(isThemePreviewMessage(null)).toBe(false);
  });
});

describe('the first-paint cache', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('holds the user’s own theme in full, and reads it back', () => {
    const custom = customFrom(PRESETS[2]);

    writeCachedChoice(custom);
    expect(window.localStorage.getItem(THEME_CACHE_KEY)).toBe('custom');
    expect(readCachedChoice()).toEqual(custom);

    writeCachedChoice(PRESETS[0]);
    expect(window.localStorage.getItem(CUSTOM_CACHE_KEY)).toBeNull();
    expect(readCachedChoice()?.id).toBe(PRESETS[0].id);
  });

  it('ignores a cached theme the page could have tampered with', () => {
    window.localStorage.setItem(THEME_CACHE_KEY, 'custom');
    window.localStorage.setItem(
      CUSTOM_CACHE_KEY,
      JSON.stringify({ ...customFrom(PRESETS[0]), palettes: { light: 'x', dark: 'y' } }),
    );
    expect(readCachedChoice()).toBeNull();

    window.localStorage.setItem(CUSTOM_CACHE_KEY, '{not json');
    expect(readCachedChoice()).toBeNull();
  });
});
