import { describe, expect, it } from 'vitest';

import { contrast, isHex, mix, type Hex } from '@/themes/color';
import { compileTheme } from '@/themes/compile';
import { DEFAULT_PRESET, isPresetId, PRESETS, presetById } from '@/themes/presets';
import { SCHEMES, type Palette, type ThemeDefinition } from '@/themes/schema';
import { validateTheme } from '@/themes/validate';

/** WCAG AA for text, and for the outlines of controls and focus. */
const TEXT = 4.5;
const NON_TEXT = 3;

/** Every pair of text and background the site draws with a theme's tokens, and what each must reach. */
function pairs(palette: Palette): [string, Hex, Hex, number][] {
  return [
    ['foreground on background', palette.foreground, palette.background, TEXT],
    ['foreground on card', palette.foreground, palette.card, TEXT],
    ['card text', palette.cardForeground, palette.card, TEXT],
    ['popover text', palette.popoverForeground, palette.popover, TEXT],
    ['muted text on card', palette.mutedForeground, palette.card, TEXT],
    ['muted text on background', palette.mutedForeground, palette.background, TEXT],
    ['muted text on muted', palette.mutedForeground, palette.muted, TEXT],
    ['text on primary', palette.primaryForeground, palette.primary, TEXT],
    ['text on primary hover', palette.primaryForeground, palette.primaryHover, TEXT],
    ['primary text on card', palette.primary, palette.card, TEXT],
    ['primary text on background', palette.primary, palette.background, TEXT],
    ['primary text on primary soft', palette.primary, palette.primarySoft, TEXT],
    ['text on secondary', palette.secondaryForeground, palette.secondary, TEXT],
    ['text on accent', palette.accentForeground, palette.accent, TEXT],
    ['destructive text on card', palette.destructiveForeground, palette.card, TEXT],
    ['links on card', palette.link, palette.card, TEXT],
    ['visited links on card', palette.linkVisited, palette.card, TEXT],
    ['title bar text at its start', palette.chromeForeground, palette.chromeStart, TEXT],
    ['title bar text at its end', palette.chromeForeground, palette.chromeEnd, TEXT],
    ['focus ring on card', palette.ring, palette.card, NON_TEXT],
    ['focus ring on background', palette.ring, palette.background, NON_TEXT],
  ];
}

/** A selector list's selectors, split on the commas outside any brackets. */
function topLevelParts(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < selector.length; index += 1) {
    const character = selector.charAt(index);

    if (character === '(' || character === '[') {
      depth += 1;
    } else if (character === ')' || character === ']') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      parts.push(selector.slice(start, index));
      start = index + 1;
    }
  }

  return [...parts, selector.slice(start)];
}

describe('theme presets', () => {
  it('ships five, with unique ids, and the default among them', () => {
    expect(PRESETS).toHaveLength(5);
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(5);
    expect(isPresetId(DEFAULT_PRESET)).toBe(true);
    expect(presetById(DEFAULT_PRESET).id).toBe(DEFAULT_PRESET);
  });

  describe.each(PRESETS.map((preset) => [preset.name, preset] as const))('%s', (_, preset: ThemeDefinition) => {
    it('is a valid theme, as one read back from storage would have to be', () => {
      expect(validateTheme(preset)).toEqual({ ok: true, theme: preset });
    });

    describe.each(SCHEMES)('in %s', (scheme) => {
      const palette = preset.palettes[scheme];

      it.each(pairs(palette))('%s reaches WCAG AA', (_, text, background, minimum) => {
        expect(contrast(text, background)).toBeGreaterThanOrEqual(minimum);
      });

      // The menu and the sidebar sit on the backdrop. A start menu is a panel of its own, so only the others count.
      it.skipIf(preset.motifs.nav === 'start-menu')('menu text on every colour of the backdrop reaches AA', () => {
        for (const stop of palette.backdrop) {
          // Between two stops the backdrop is a mix of them; checking each stop and each midpoint covers it.
          const next = palette.backdrop[palette.backdrop.indexOf(stop) + 1];
          const colours = next === undefined ? [stop] : [stop, mix(stop, next, 0.5)];

          for (const colour of colours) {
            expect(contrast(palette.foreground, colour)).toBeGreaterThanOrEqual(TEXT);
            expect(contrast(palette.mutedForeground, colour)).toBeGreaterThanOrEqual(TEXT);
          }
        }
      });
    });

    it('never nests :has(), which browsers reject along with the whole rule', () => {
      const css = compileTheme(preset);

      for (const match of css.matchAll(/:has\(/g)) {
        let depth = 1;
        let index = match.index + ':has('.length;

        while (depth > 0 && index < css.length) {
          if (css.startsWith(':has(', index)) {
            throw new Error(`Nested :has() near: ${css.slice(match.index, match.index + 120)}`);
          }

          depth += css[index] === '(' ? 1 : css[index] === ')' ? -1 : 0;
          index += 1;
        }
      }
    });

    it('compiles to CSS scoped to the theme alone', () => {
      const css = compileTheme(preset);
      // Fonts are base64, which can spell anything.
      const withoutFonts = css.replace(/url\('data:[^']*'\)/g, '');

      expect(withoutFonts).not.toMatch(/undefined|NaN|\[object Object\]/);
      // Balanced braces, so no rule can swallow the next.
      expect(css.split('{').length).toBe(css.split('}').length);

      // Every rule outside at-rules starts with this theme's root, so nothing applies while another theme, or none, is on.
      const rules = css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/@font-face\s*\{[^}]*\}/g, '')
        .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '');
      const selectors = [...rules.matchAll(/(?:^|\})\s*([^{}@]+?)\s*\{/g)].map((match) => match[1]?.trim() ?? '');

      expect(selectors.length).toBeGreaterThan(0);

      for (const selector of selectors) {
        for (const part of topLevelParts(selector)) {
          expect(part.trim()).toMatch(new RegExp(`^:root\\[data-dnpp-theme="${preset.id}"\\]`));
        }
      }
    });
  });
});

describe('theme validation', () => {
  const valid = presetById('terminal-modern');
  const broken = (change: (theme: Record<string, unknown>) => void): unknown => {
    const copy = structuredClone(valid) as unknown as Record<string, unknown>;

    change(copy);

    return copy;
  };

  it.each([
    [
      'a colour that is not #rrggbb',
      broken((theme) => {
        (theme.palettes as { light: Record<string, unknown> }).light.primary = 'red; background: url(//x)';
      }),
    ],
    [
      'a short colour',
      broken((theme) => {
        (theme.palettes as { dark: Record<string, unknown> }).dark.card = '#fff';
      }),
    ],
    [
      'an id that could leave the selector',
      broken((theme) => {
        theme.id = 'x"] body { display: none } [x="';
      }),
    ],
    [
      'an unknown font',
      broken((theme) => {
        (theme.type as Record<string, unknown>).sans = 'Comic Sans MS';
      }),
    ],
    [
      'an unknown motif',
      broken((theme) => {
        (theme.motifs as Record<string, unknown>).post = 'marquee';
      }),
    ],
    [
      'a radius out of range',
      broken((theme) => {
        (theme.shape as Record<string, unknown>).radius = 999;
      }),
    ],
    [
      'a field it does not know',
      broken((theme) => {
        theme.css = 'body { display: none }';
      }),
    ],
    [
      'a missing palette',
      broken((theme) => {
        delete (theme.palettes as Record<string, unknown>).dark;
      }),
    ],
    [
      'too many backdrop stops',
      broken((theme) => {
        (theme.palettes as { light: Record<string, unknown> }).light.backdrop = Array(5).fill('#000000');
      }),
    ],
    [
      'a shadow of an unknown kind',
      broken((theme) => {
        (theme.depth as Record<string, unknown>).card = { kind: 'glow' };
      }),
    ],
    ['not an object at all', 'terminal-modern'],
  ])('rejects %s', (_, theme) => {
    expect(validateTheme(theme).ok).toBe(false);
  });
});

describe('colour', () => {
  it('measures contrast as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('only accepts six-digit lowercase hex', () => {
    expect(isHex('#a1b2c3')).toBe(true);
    expect(isHex('#A1B2C3')).toBe(false);
    expect(isHex('#abc')).toBe(false);
    expect(isHex('rgb(0 0 0)')).toBe(false);
  });

  it('mixes two colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
