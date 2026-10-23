import { contrast, mix, type Hex } from './color';
import { NON_TEXT, TEXT } from './contrast';
import type { Palette, ThemeDefinition } from './schema';
import { validateTheme } from './validate';

/**
 * The user's own theme. It is a theme like any preset, made of the same data and checked by the same validator, and
 * always has this id, so there is only ever one, and it can never be mistaken for a preset.
 */
export const CUSTOM_THEME_ID = 'custom';

export type CustomTheme = ThemeDefinition<typeof CUSTOM_THEME_ID>;

/** Longer than any real theme by far, so a pasted file cannot make us parse megabytes. */
export const MAX_THEME_JSON = 16_384;

export function parseCustomTheme(value: unknown): CustomTheme | null {
  const result = validateTheme(value);

  return result.ok && result.theme.id === CUSTOM_THEME_ID ? (result.theme as CustomTheme) : null;
}

/** A copy of `theme` to edit as the user's own: plain data, so a deep copy through JSON is exact. */
export function customFrom(theme: ThemeDefinition, name = theme.name): CustomTheme {
  const copy = JSON.parse(JSON.stringify(theme)) as ThemeDefinition;

  return { ...copy, id: CUSTOM_THEME_ID, name: name.slice(0, 40) };
}

export type ImportResult = { ok: true; theme: CustomTheme } | { ok: false; errors: string[] };

/** A theme shared as JSON, from any id: checked in full, then made the user's own. */
export function importTheme(text: string): ImportResult {
  if (text.length > MAX_THEME_JSON) {
    return { ok: false, errors: ['That is far too long to be a theme.'] };
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['That is not JSON.'] };
  }

  const result = validateTheme(value);

  if (!result.ok) {
    return { ok: false, errors: result.errors.slice(0, 6) };
  }

  return { ok: true, theme: customFrom(result.theme) };
}

export function exportTheme(theme: CustomTheme): string {
  return JSON.stringify(theme, null, 2);
}

/**
 * `text`, or the nearest colour to it towards black or white that reaches `minimum` on every one of `backgrounds`. Used
 * for colours the editor works out itself, so they are always readable; the ones the user picks are left as picked.
 */
export function readable(text: Hex, backgrounds: readonly Hex[], minimum = TEXT): Hex {
  const worst = (colour: Hex): number => Math.min(...backgrounds.map((background) => contrast(colour, background)));

  if (worst(text) >= minimum) {
    return text;
  }

  let best: { colour: Hex; steps: number } | null = null;

  for (const target of ['#000000', '#ffffff'] as const) {
    for (let step = 1; step <= 20; step += 1) {
      const colour = mix(text, target, step / 20);

      if (worst(colour) >= minimum) {
        if (best === null || step < best.steps) {
          best = { colour, steps: step };
        }

        break;
      }
    }
  }

  if (best !== null) {
    return best.colour;
  }

  return worst('#000000') >= worst('#ffffff') ? '#000000' : '#ffffff';
}

/**
 * The colours the editor shows first, each standing for a group of tokens. Setting one sets its group and works out
 * the colours that go with it, keeping the worked-out ones readable.
 */
export interface KeyColour {
  id: string;
  label: string;
  read: (palette: Palette) => Hex;
  write: (palette: Palette, colour: Hex) => Palette;
}

/** The surfaces drawn just off the page colour: hovers, secondary buttons, muted panels. */
function surfaces(palette: Palette): Palette {
  const near = mix(palette.background, palette.foreground, 0.07);

  return settle({ ...palette, secondary: near, muted: near, accent: near });
}

/** Re-derives every worked-out text colour so it reads on what it sits on. */
function settle(palette: Palette): Palette {
  const text = palette.foreground;

  return {
    ...palette,
    cardForeground: readable(text, [palette.card]),
    popoverForeground: readable(text, [palette.popover]),
    secondaryForeground: readable(text, [palette.secondary]),
    accentForeground: readable(text, [palette.accent]),
    mutedForeground: readable(palette.mutedForeground, [palette.card, palette.background, palette.muted]),
    primaryForeground: readable(palette.primaryForeground, [palette.primary, palette.primaryHover]),
    linkVisited: readable(palette.linkVisited, [palette.card]),
    chromeForeground: readable(palette.chromeForeground, [palette.chromeStart, palette.chromeEnd]),
    ring: readable(palette.ring, [palette.card, palette.background], NON_TEXT),
  };
}

export const KEY_COLOURS: readonly KeyColour[] = [
  {
    id: 'background',
    label: 'Page',
    read: (palette) => palette.background,
    write: (palette, colour) => surfaces({ ...palette, background: colour }),
  },
  {
    id: 'card',
    label: 'Cards',
    read: (palette) => palette.card,
    write: (palette, colour) => settle({ ...palette, card: colour, popover: colour }),
  },
  {
    id: 'foreground',
    label: 'Text',
    read: (palette) => palette.foreground,
    write: (palette, colour) => surfaces({ ...palette, foreground: colour }),
  },
  {
    id: 'muted-foreground',
    label: 'Quiet text',
    read: (palette) => palette.mutedForeground,
    write: (palette, colour) => ({ ...palette, mutedForeground: colour }),
  },
  {
    id: 'primary',
    label: 'Accent',
    read: (palette) => palette.primary,
    write: (palette, colour) =>
      settle({
        ...palette,
        primary: colour,
        ring: colour,
        primaryHover: mix(colour, palette.foreground, 0.15),
        primarySoft: mix(colour, palette.background, 0.86),
        primaryForeground: readable(palette.primaryForeground, [colour]),
      }),
  },
  {
    id: 'border',
    label: 'Borders',
    read: (palette) => palette.border,
    write: (palette, colour) => ({ ...palette, border: colour, input: colour, rail: colour }),
  },
  {
    id: 'link',
    label: 'Links',
    read: (palette) => palette.link,
    write: (palette, colour) =>
      settle({ ...palette, link: colour, linkVisited: mix(colour, palette.foreground, 0.35) }),
  },
  {
    id: 'highlight',
    label: 'Sparkle',
    read: (palette) => palette.highlight,
    write: (palette, colour) => ({ ...palette, highlight: colour }),
  },
  {
    id: 'chrome-start',
    label: 'Title bar',
    read: (palette) => palette.chromeStart,
    write: (palette, colour) =>
      settle({ ...palette, chromeStart: colour, chromeEnd: mix(colour, palette.background, 0.25) }),
  },
];
