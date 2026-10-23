import type { Hex } from './color';

/**
 * What a theme is: data, and nothing but data. Colours are `#rrggbb`, sizes are numbers in a range, and everything
 * else is picked from a fixed list. The engine (compile.ts) turns that into CSS; a theme never carries CSS of its own,
 * so a theme cannot break out of what the engine allows, and a stored or edited one can always be checked in full.
 */

export const SCHEMES = ['light', 'dark'] as const;

/** A theme follows the site's own light or dark setting, so each has a palette for both. */
export type Scheme = (typeof SCHEMES)[number];

/**
 * Every colour a theme sets. The first group are the site's own tokens (resources/css/app.css), so everything the
 * site draws follows the theme; the rest are the engine's, for what themes add on top.
 */
export interface Palette {
  background: Hex;
  foreground: Hex;
  card: Hex;
  cardForeground: Hex;
  popover: Hex;
  popoverForeground: Hex;
  primary: Hex;
  primaryForeground: Hex;
  primaryHover: Hex;
  primarySoft: Hex;
  secondary: Hex;
  secondaryForeground: Hex;
  muted: Hex;
  mutedForeground: Hex;
  accent: Hex;
  accentForeground: Hex;
  destructive: Hex;
  destructiveForeground: Hex;
  border: Hex;
  input: Hex;
  ring: Hex;
  rail: Hex;
  /** The commit graph's six lane colours. */
  lanes: readonly [Hex, Hex, Hex, Hex, Hex, Hex];

  /** Links in what people write. */
  link: Hex;
  linkVisited: Hex;
  /** Outlines and hard shadows. */
  ink: Hex;
  /** A second accent, for ornaments: sparkles, hearts, bows. */
  highlight: Hex;
  /** A bevel's lit and shaded edges. */
  edgeLight: Hex;
  edgeDark: Hex;
  /** Title bars and other chrome: a gradient from start to end, with text on it. */
  chromeStart: Hex;
  chromeEnd: Hex;
  chromeForeground: Hex;
  /** Behind the page: one colour, or the stops of a gradient from top to bottom. */
  backdrop: readonly Hex[];
}

export const FONT_IDS = [
  // The site's own, already loaded.
  'geist',
  'geist-mono',
  // Bundled with the extension (OFL-1.1).
  'fredoka',
  'nunito',
  'pixelify',
  // Installed on the user's system.
  'system-sans',
  'system-serif',
  'system-mono',
  'retro-sans',
  'retro-mono',
] as const;

export type FontId = (typeof FONT_IDS)[number];

export type Shadow =
  | { kind: 'none' }
  /** A soft drop shadow, tinted with the theme's ink. */
  | { kind: 'soft'; y: number; blur: number; opacity: number }
  /** A solid offset shadow in the theme's ink, like a cel or a sticker. */
  | { kind: 'hard'; x: number; y: number };

/** How a commit is drawn. */
export const POST_MOTIFS = ['plain', 'bubble', 'window', 'article'] as const;
/** How the main navigation is drawn. */
export const NAV_MOTIFS = ['plain', 'link-list', 'start-menu'] as const;
/** The star button's glyph. Only its look changes: it still stars. */
export const STAR_MOTIFS = ['star', 'heart'] as const;
/** Small decorations on top. */
export const ORNAMENT_MOTIFS = ['none', 'sparkles', 'bows'] as const;
/** A texture over the backdrop. */
export const TEXTURE_MOTIFS = ['none', 'halftone', 'speed-lines', 'dither'] as const;
/** Headings. */
export const HEADING_MOTIFS = ['plain', 'ruled', 'title-bar'] as const;
/** The profile card in the sidebar and the profile page's header. */
export const PROFILE_MOTIFS = ['plain', 'infobox'] as const;
/** Buttons and fields. */
export const CONTROL_MOTIFS = ['flat', 'outlined', 'bevel', 'pill'] as const;
/** What a press does. */
export const PRESS_MOTIFS = ['none', 'sink', 'pop'] as const;
/** What hovering does. */
export const HOVER_MOTIFS = ['none', 'lift', 'bounce'] as const;
export const SCROLLBAR_MOTIFS = ['thin', 'chunky'] as const;

export interface Motifs {
  post: (typeof POST_MOTIFS)[number];
  nav: (typeof NAV_MOTIFS)[number];
  star: (typeof STAR_MOTIFS)[number];
  ornaments: (typeof ORNAMENT_MOTIFS)[number];
  texture: (typeof TEXTURE_MOTIFS)[number];
  headings: (typeof HEADING_MOTIFS)[number];
  profile: (typeof PROFILE_MOTIFS)[number];
  controls: (typeof CONTROL_MOTIFS)[number];
  press: (typeof PRESS_MOTIFS)[number];
  hover: (typeof HOVER_MOTIFS)[number];
  scrollbar: (typeof SCROLLBAR_MOTIFS)[number];
}

export interface Typography {
  /** Body text. */
  sans: FontId;
  mono: FontId;
  /** Headings, names and chrome. */
  display: FontId;
  /** 400 to 900. */
  displayWeight: number;
  /** Letter spacing for headings, in em, -0.05 to 0.1. */
  displayTracking: number;
}

export interface Shape {
  /** Corner radius for cards and controls, in px, 0 to 28. Avatars stay round. */
  radius: number;
  /** Border width for cards and controls, in px, 1 to 4. */
  border: number;
}

export interface Depth {
  /** Commits, sidebar blocks and other cards. */
  card: Shadow;
  /** Menus, dialogs and tooltips. */
  overlay: Shadow;
}

export interface Motion {
  /** The base duration of transitions, in ms, 0 to 400. Reduced motion always turns it off. */
  duration: number;
}

export interface ThemeDefinition<Id extends string = string> {
  /** Lowercase letters, digits and dashes. It ends up in a CSS selector, so nothing else is allowed. */
  id: Id;
  name: string;
  /** One short line for the picker. */
  tagline: string;
  /** The scheme it is designed around, shown first in the picker. Both are always available. */
  signature: Scheme;
  palettes: Record<Scheme, Palette>;
  type: Typography;
  shape: Shape;
  depth: Depth;
  motion: Motion;
  motifs: Motifs;
}

/** The colour fields of a palette, for walking them all. */
export const PALETTE_COLOURS = [
  'background',
  'foreground',
  'card',
  'cardForeground',
  'popover',
  'popoverForeground',
  'primary',
  'primaryForeground',
  'primaryHover',
  'primarySoft',
  'secondary',
  'secondaryForeground',
  'muted',
  'mutedForeground',
  'accent',
  'accentForeground',
  'destructive',
  'destructiveForeground',
  'border',
  'input',
  'ring',
  'rail',
  'link',
  'linkVisited',
  'ink',
  'highlight',
  'edgeLight',
  'edgeDark',
  'chromeStart',
  'chromeEnd',
  'chromeForeground',
] as const satisfies readonly (keyof Palette)[];

export const THEME_ID = /^[a-z][a-z0-9-]{0,31}$/;
