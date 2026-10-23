import { contrast, type Hex } from './color';
import type { Palette } from './schema';

/** WCAG AA for text, and for the outlines of controls and focus. */
export const TEXT = 4.5;
export const NON_TEXT = 3;

export interface ContrastPair {
  label: string;
  text: Hex;
  background: Hex;
  minimum: number;
}

/** Every pair of text and background the site draws with a theme's tokens, and what each must reach. */
export function contrastPairs(palette: Palette): ContrastPair[] {
  const pair = (label: string, text: Hex, background: Hex, minimum = TEXT): ContrastPair => ({
    label,
    text,
    background,
    minimum,
  });

  return [
    pair('Text on the page', palette.foreground, palette.background),
    pair('Text on cards', palette.foreground, palette.card),
    pair('Card text', palette.cardForeground, palette.card),
    pair('Menu text', palette.popoverForeground, palette.popover),
    pair('Muted text on cards', palette.mutedForeground, palette.card),
    pair('Muted text on the page', palette.mutedForeground, palette.background),
    pair('Muted text on muted', palette.mutedForeground, palette.muted),
    pair('Text on the accent', palette.primaryForeground, palette.primary),
    pair('Text on the accent, hovered', palette.primaryForeground, palette.primaryHover),
    pair('Accent text on cards', palette.primary, palette.card),
    pair('Accent text on the page', palette.primary, palette.background),
    pair('Accent text on soft accent', palette.primary, palette.primarySoft),
    pair('Text on secondary', palette.secondaryForeground, palette.secondary),
    pair('Text on hover', palette.accentForeground, palette.accent),
    pair('Warnings on cards', palette.destructiveForeground, palette.card),
    pair('Links on cards', palette.link, palette.card),
    pair('Visited links on cards', palette.linkVisited, palette.card),
    pair('Title bar text, left', palette.chromeForeground, palette.chromeStart),
    pair('Title bar text, right', palette.chromeForeground, palette.chromeEnd),
    pair('Focus ring on cards', palette.ring, palette.card, NON_TEXT),
    pair('Focus ring on the page', palette.ring, palette.background, NON_TEXT),
  ];
}

/** The pairs that fall short, with what they reach. */
export function contrastIssues(palette: Palette): (ContrastPair & { ratio: number })[] {
  return contrastPairs(palette)
    .map((pair) => ({ ...pair, ratio: contrast(pair.text, pair.background) }))
    .filter(({ ratio, minimum }) => ratio < minimum);
}
