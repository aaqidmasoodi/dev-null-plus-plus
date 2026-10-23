import type { FontId, Motifs, Shadow } from '@/themes/schema';

/**
 * What the editor calls each choice. Typed by the schema's own lists, so a font or motif added there cannot ship
 * without a name here.
 */

export const FONT_LABELS: Record<FontId, string> = {
  geist: 'Geist, the site’s own',
  'geist-mono': 'Geist Mono',
  fredoka: 'Fredoka, rounded',
  nunito: 'Nunito, soft',
  pixelify: 'Pixelify, pixel',
  'system-sans': 'System sans',
  'system-serif': 'Reading serif',
  'system-mono': 'System mono',
  'retro-sans': '90s sans',
  'retro-mono': '90s mono',
};

export const MOTIF_LABELS: { [K in keyof Motifs]: { label: string; options: Record<Motifs[K], string> } } = {
  post: {
    label: 'Commits',
    options: { plain: 'Rows', bubble: 'Speech bubbles', window: 'Windows', article: 'Article sections' },
  },
  nav: { label: 'Menu', options: { plain: 'Plain', 'link-list': 'List of links', 'start-menu': 'Start menu' } },
  controls: { label: 'Buttons', options: { flat: 'Flat', outlined: 'Outlined', bevel: 'Bevelled', pill: 'Pills' } },
  headings: { label: 'Headings', options: { plain: 'Plain', ruled: 'Ruled', 'title-bar': 'Title bars' } },
  star: { label: 'Star button', options: { star: 'Star', heart: 'Heart' } },
  texture: {
    label: 'Backdrop texture',
    options: { none: 'None', halftone: 'Halftone dots', 'speed-lines': 'Speed lines', dither: 'Dither' },
  },
  ornaments: { label: 'Decorations', options: { none: 'None', sparkles: 'Sparkles', bows: 'Bows' } },
  profile: { label: 'Profile card', options: { plain: 'Plain', infobox: 'Infobox' } },
  press: { label: 'On press', options: { none: 'Nothing', sink: 'Sink', pop: 'Pop' } },
  hover: { label: 'On hover', options: { none: 'Nothing', lift: 'Lift', bounce: 'Bounce' } },
  scrollbar: { label: 'Scrollbars', options: { thin: 'Thin', chunky: 'Chunky' } },
};

export const SHADOW_LABELS: Record<Shadow['kind'], string> = {
  none: 'None',
  soft: 'Soft',
  hard: 'Solid, offset',
};
