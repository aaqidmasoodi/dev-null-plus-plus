import { rgbChannels } from './color';
import { FONTS, fontFaces } from './fonts';
import * as hook from './hooks';
import type { Palette, Shadow, ThemeDefinition } from './schema';

/**
 * Turns a theme into CSS. Everything a theme can look like is written here, once, and driven by the theme's data:
 * its colours become the site's own tokens (so everything the site draws follows), and its motifs pick from the
 * fixed set of looks below.
 *
 * How it stays out of the site's way:
 * - Every rule is scoped to `:root[data-dnpp-theme="<id>"]`, so nothing applies unless that theme is on, and switching
 *   themes or turning them off is one attribute.
 * - The site's styles are Tailwind's, in cascade layers; these are not, so they win without `!important`. Because they
 *   win outright, rules here only set what the site does not vary by state (shapes, borders, shadows, fonts), and leave
 *   colours to the tokens, which the site's own hover and active styles already use.
 * - Only hooks from hooks.ts are used. If one stops matching, its rules do nothing and the rest of the theme stands.
 */

export const THEME_ATTRIBUTE = 'data-dnpp-theme';

const ICON = (paths: string, viewBox = '0 0 24 24'): string =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'>${paths}</svg>`)}")`;

/** Lucide's heart, outlined and filled, for the star button when it is a heart. */
const HEART_OUTLINE = ICON(
  "<path d='M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' fill='none' stroke='black' stroke-width='2' stroke-linejoin='round'/>",
);
const HEART_FILLED = ICON(
  "<path d='M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' stroke='black' stroke-width='2' stroke-linejoin='round'/>",
);
/** A four-pointed sparkle. */
const SPARKLE = ICON(
  "<path d='M12 0c.8 6.4 5.6 11.2 12 12-6.4.8-11.2 5.6-12 12-.8-6.4-5.6-11.2-12-12C6.4 11.2 11.2 6.4 12 0Z'/>",
);
/** A small bow. */
const BOW = ICON(
  "<path d='M12 10.5C9 6 3.5 3.5 2 6s.5 8 4 8.5c2.5.3 4.6-1.4 6-4Zm0 0c3-4.5 8.5-7 10-4.5s-.5 8-4 8.5c-2.5.3-4.6-1.4-6-4Z'/><circle cx='12' cy='10.7' r='2.2'/><path d='M11 12.5 8 21l3-1.5 1 2.5 1-2.5 3 1.5-3-8.5Z'/>",
);
/** A minimise, maximise and close glyph, drawn as one strip for a title bar. */
const WINDOW_GLYPHS = ICON(
  "<path d='M3 10h6v2H3z'/><path d='M17 3h7v7h-7zM18 5v4h5V5z'/><path d='M30 3l2 0 2 2.5L36 3h2l-3 3.5 3 3.5h-2l-2-2.5-2 2.5h-2l3-3.5z'/>",
  '0 0 41 13',
);

function shadow(value: Shadow): string {
  switch (value.kind) {
    case 'none':
      return 'none';
    case 'soft':
      return `0 ${String(value.y)}px ${String(value.blur)}px -${String(Math.round(value.blur / 4))}px rgb(var(--dnpp-ink-rgb) / ${String(value.opacity)})`;
    case 'hard':
      return `${String(value.x)}px ${String(value.y)}px 0 0 var(--dnpp-ink)`;
  }
}

function colours(palette: Palette): string {
  // One colour is a gradient of itself, so a single-colour backdrop can still differ from the page colour.
  const stops = palette.backdrop.length > 1 ? palette.backdrop : [palette.backdrop[0], palette.backdrop[0]];
  const backdrop = `linear-gradient(180deg, ${stops.join(', ')})`;
  const declarations: Record<string, string> = {
    '--background': palette.background,
    '--foreground': palette.foreground,
    '--card': palette.card,
    '--card-foreground': palette.cardForeground,
    '--popover': palette.popover,
    '--popover-foreground': palette.popoverForeground,
    '--primary': palette.primary,
    '--primary-foreground': palette.primaryForeground,
    '--primary-hover': palette.primaryHover,
    '--primary-soft': palette.primarySoft,
    '--secondary': palette.secondary,
    '--secondary-foreground': palette.secondaryForeground,
    '--muted': palette.muted,
    '--muted-foreground': palette.mutedForeground,
    '--accent': palette.accent,
    '--accent-foreground': palette.accentForeground,
    '--destructive': palette.destructive,
    '--destructive-foreground': palette.destructiveForeground,
    '--border': palette.border,
    '--input': palette.input,
    '--ring': palette.ring,
    '--rail': palette.rail,
    ...Object.fromEntries(palette.lanes.map((lane, index) => [`--lane-${String(index)}`, lane])),
    '--dnpp-link': palette.link,
    '--dnpp-link-visited': palette.linkVisited,
    '--dnpp-ink': palette.ink,
    '--dnpp-ink-rgb': rgbChannels(palette.ink),
    '--dnpp-highlight': palette.highlight,
    '--dnpp-edge-light': palette.edgeLight,
    '--dnpp-edge-dark': palette.edgeDark,
    '--dnpp-chrome-start': palette.chromeStart,
    '--dnpp-chrome-end': palette.chromeEnd,
    '--dnpp-chrome-foreground': palette.chromeForeground,
    '--dnpp-backdrop': backdrop,
  };

  return Object.entries(declarations)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
}

/** The theme's tokens: colours for light and dark, then type, shape, depth and motion. */
function tokens(theme: ThemeDefinition, root: string): string {
  const { type, shape, depth, motion } = theme;

  return `
${root} {
  ${colours(theme.palettes.light)}
  --font-sans: ${FONTS[type.sans].stack};
  --font-mono: ${FONTS[type.mono].stack};
  --dnpp-display: ${FONTS[type.display].stack};
  --dnpp-display-weight: ${String(type.displayWeight)};
  --dnpp-display-tracking: ${String(type.displayTracking)}em;
  --radius: ${String(shape.radius)}px;
  --dnpp-radius: ${String(shape.radius)}px;
  --dnpp-border: ${String(shape.border)}px;
  --dnpp-card-shadow: ${shadow(depth.card)};
  --dnpp-overlay-shadow: ${shadow(depth.overlay)};
  --dnpp-duration: ${String(motion.duration)}ms;
}
${root}.dark { ${colours(theme.palettes.dark)} }
@media (prefers-reduced-motion: reduce) {
  ${root} { --dnpp-duration: 0ms; }
}`;
}

/** What every theme gets: the backdrop, type, links, overlays and focus. */
function base(theme: ThemeDefinition, root: string): string {
  const open = theme.motifs.post === 'bubble' || theme.motifs.post === 'window';

  return `
/* On <html>, which the site paints too, so the backdrop fills the window however tall the page. */
${root} {
  background-color: var(--background);
  background-image: var(--dnpp-texture, none), var(--dnpp-backdrop);
  background-size: var(--dnpp-texture-size, auto), auto;
  background-attachment: fixed;
}
${root} body {
  background: transparent;
  font-family: var(--font-sans);
}
${root} :is(h1, h2, h3, ${hook.DIALOG_TITLE}) {
  font-family: var(--dnpp-display);
  font-weight: var(--dnpp-display-weight);
  letter-spacing: var(--dnpp-display-tracking);
}
${root} :is(${hook.POST_BODY}) a:not(${hook.BUTTON}) { color: var(--dnpp-link); }
${root} :is(${hook.POST_BODY}) a:not(${hook.BUTTON}):visited { color: var(--dnpp-link-visited); }
${root} :is(${hook.OVERLAYS}) {
  border: var(--dnpp-border) solid var(--border);
  border-radius: var(--dnpp-radius);
  box-shadow: var(--dnpp-overlay-shadow);
}
${root} :is(${hook.TOOLTIP}) { border-radius: min(var(--dnpp-radius), 8px); }
${
  open
    ? `
/* Cards stand on the page instead of being rows in it, so the feed column takes the page colour and they the card's. */
${root} :is(${hook.MAIN}), ${root} :is(${hook.PAGE_HEADER}) {
  background-color: var(--background);
}
${root} :is(${hook.COMPOSER}):not(${hook.DIALOG} *) {
  margin: 12px;
  padding: 10px 12px;
  border: var(--dnpp-border) solid var(--border);
  border-radius: var(--dnpp-radius);
  background-color: var(--card);
  box-shadow: var(--dnpp-card-shadow);
}`
    : ''
}`;
}

function controls(theme: ThemeDefinition, root: string): string {
  const { controls: kind, press } = theme.motifs;
  const solid = `${hook.BUTTON}:is([class~="bg-primary"], [class~="bg-secondary"], [class~="bg-background"], [class~="bg-destructive"])`;
  const fields = `${root} :is(${hook.FIELDS}):not(${hook.COMPOSER} *)`;
  let css = `
${root} :is(${hook.BUTTON}) { border-radius: min(var(--dnpp-radius), 10px); }
${fields} { border-radius: min(var(--dnpp-radius), 10px); }`;

  if (kind === 'outlined') {
    css += `
${root} :is(${solid}) {
  border: var(--dnpp-border) solid var(--dnpp-ink);
  box-shadow: 3px 3px 0 0 var(--dnpp-ink);
}
${fields} { border: var(--dnpp-border) solid var(--dnpp-ink); }`;
  }

  if (kind === 'pill') {
    css += `
${root} :is(${hook.BUTTON}) { border-radius: 999px; }
${fields} { border-radius: 999px; }
${root} textarea:not(${hook.COMPOSER} *) { border-radius: var(--dnpp-radius); }`;
  }

  if (kind === 'bevel') {
    // A raised button that sinks when pressed, as on a 90s desktop. Hover states are the site's own.
    css += `
${root} :is(${hook.BUTTON}):not([class~="bg-transparent"]) {
  border-radius: 0;
  border: 0;
  box-shadow:
    inset -1px -1px 0 0 var(--dnpp-ink),
    inset 1px 1px 0 0 var(--dnpp-edge-light),
    inset -2px -2px 0 0 var(--dnpp-edge-dark),
    inset 2px 2px 0 0 var(--background);
}
${root} :is(${hook.BUTTON}):not([class~="bg-transparent"]):active {
  box-shadow:
    inset 1px 1px 0 0 var(--dnpp-ink),
    inset -1px -1px 0 0 var(--dnpp-edge-light),
    inset 2px 2px 0 0 var(--dnpp-edge-dark),
    inset -2px -2px 0 0 var(--background);
}
${root} ::selection { background-color: var(--dnpp-chrome-start); color: var(--dnpp-chrome-foreground); }
${fields} {
  border-radius: 0;
  border: 0;
  background-color: var(--card);
  box-shadow:
    inset 1px 1px 0 0 var(--dnpp-edge-dark),
    inset -1px -1px 0 0 var(--dnpp-edge-light),
    inset 2px 2px 0 0 var(--dnpp-ink),
    inset -2px -2px 0 0 var(--background);
}`;
  }

  if (press === 'sink') {
    css += `
${root} :is(${hook.BUTTON}, ${hook.STAR_BUTTON}):active:not(:disabled) { translate: 0 1px; }`;
  }

  if (press === 'pop') {
    css += `
@media (prefers-reduced-motion: no-preference) {
  ${root} :is(${hook.BUTTON}, ${hook.STAR_BUTTON}) {
    transition: scale var(--dnpp-duration) cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  ${root} :is(${hook.BUTTON}, ${hook.STAR_BUTTON}):active:not(:disabled) { scale: 0.92; }
}`;
  }

  return css;
}

/** How commits and replies are drawn. */
function posts(theme: ThemeDefinition, root: string): string {
  const content = `${root} :is(${hook.POST_CONTENT}, ${hook.REPLY_CONTENT})`;
  const byline = `${root} :is(${hook.POST_CONTENT}, ${hook.REPLY_CONTENT}) :is(${hook.POST_BYLINE})`;

  switch (theme.motifs.post) {
    case 'plain':
      return '';

    case 'bubble':
      // A speech bubble beside the author's avatar, its tail pointing at it.
      return `
${content} {
  position: relative;
  margin: 8px 12px 10px 0;
  padding: 10px 14px 8px;
  border: var(--dnpp-border) solid var(--border);
  border-radius: var(--dnpp-radius);
  background-color: var(--card);
  box-shadow: var(--dnpp-card-shadow);
}
${content}::before {
  content: '';
  position: absolute;
  top: 18px;
  left: calc(-1 * (var(--dnpp-border) + 9px));
  width: 14px;
  height: 14px;
  border-left: var(--dnpp-border) solid var(--border);
  border-bottom: var(--dnpp-border) solid var(--border);
  background-color: var(--card);
  rotate: 45deg;
  clip-path: polygon(0 0, 0 100%, 100% 100%);
}`;

    case 'window':
      // A window: bevelled frame, the byline as its title bar, with minimise, maximise and close glyphs.
      return `
${content} {
  margin: 8px 12px 10px 0;
  padding: 3px 3px 8px;
  border: 0;
  background-color: var(--card);
  box-shadow:
    inset -1px -1px 0 0 var(--dnpp-ink),
    inset 1px 1px 0 0 var(--dnpp-edge-light),
    inset -2px -2px 0 0 var(--dnpp-edge-dark),
    inset 2px 2px 0 0 var(--background);
}
${content} > * > * > :not(:is(${hook.POST_BYLINE})) { padding-inline: 8px; }
${byline} {
  position: relative;
  margin-bottom: 6px;
  padding: 2px 52px 2px 6px;
  background: linear-gradient(90deg, var(--dnpp-chrome-start), var(--dnpp-chrome-end));
  font-family: var(--dnpp-display);
  font-weight: 700;
}
${byline}, ${byline} :is(a, span, time) { color: var(--dnpp-chrome-foreground); }
${byline}::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 4px;
  width: 41px;
  height: 13px;
  translate: 0 -50%;
  background-color: var(--dnpp-chrome-foreground);
  mask: ${WINDOW_GLYPHS} center / contain no-repeat;
}`;

    case 'article':
      // A section of a reference article: the byline as its heading over a thin rule, the time as a footnote, and the
      // actions as bracketed links.
      return `
${content} { border-bottom: 0; }
${byline} {
  margin-bottom: 4px;
  padding-bottom: 2px;
  border-bottom: 1px solid var(--border);
  font-family: var(--dnpp-display);
  font-size: 1.15em;
}
${byline} ${hook.POST_PERMALINK} {
  align-self: flex-start;
  font-family: var(--font-sans);
  font-size: 0.72em;
}
${byline} ${hook.POST_PERMALINK}::before { content: '['; }
${byline} ${hook.POST_PERMALINK}::after { content: ']'; }
${root} :is(${hook.POST_ACTIONS}) :is(button) {
  border-radius: 0;
  color: var(--dnpp-link);
}
${root} :is(${hook.POST_ACTIONS}) :is(button)::before { content: '['; color: var(--muted-foreground); }
${root} :is(${hook.POST_ACTIONS}) :is(button)::after { content: ']'; color: var(--muted-foreground); }
${root} :is(${hook.POST_ACTIONS}) :is(button):hover { background-color: transparent; text-decoration: underline; }`;
  }
}

/** What people put inside a commit (link previews, quotes, pictures, polls, code), drawn to match the commit. */
function embeds(theme: ThemeDefinition, root: string): string {
  const cards = `${root} :is(${hook.EMBEDS})`;
  let css = `
${root} :is(${hook.INLINE_CODE}) { border-radius: min(var(--dnpp-radius), 4px); }`;

  switch (theme.motifs.post) {
    case 'plain':
      css += `
${cards} { border-radius: min(var(--dnpp-radius), 12px); }`;
      break;

    case 'bubble':
      // A smaller card in the bubble, with the bubble's outline, a little thinner.
      css += `
${cards} {
  border: max(1px, calc(var(--dnpp-border) - 1px)) solid var(--border);
  border-radius: calc(var(--dnpp-radius) * 0.6);
}`;
      break;

    case 'window':
      // Sunken into the window, as a field is. A border rather than a shadow, so pictures cannot cover it.
      css += `
${cards} {
  border: 2px solid;
  border-color: var(--dnpp-edge-dark) var(--dnpp-edge-light) var(--dnpp-edge-light) var(--dnpp-edge-dark);
  border-radius: 0;
}
${root} :is(${hook.INLINE_CODE}) { border-radius: 0; }`;
      break;

    case 'article':
      // Square, thin-ruled boxes; a quoted commit is set in like a quotation.
      css += `
${cards} { border-radius: 0; }
${root} :is(${hook.QUOTED_POST}) { border-width: 0 0 0 3px; border-color: var(--border); background-color: var(--muted); }`;
      break;
  }

  return css;
}

/** Tabs, segmented controls, chips and checkboxes, drawn like the theme's buttons. */
function widgets(theme: ThemeDefinition, root: string): string {
  const tabs = `${root} :is(${hook.PAGE_TABS})`;
  const segments = `${root} :is(${hook.SEGMENTS})`;
  const chips = `${root} :is(${hook.CHIPS})`;
  const checkbox = `${root} :is(${hook.CHECKBOX})`;
  let css = `
${root} :is(${hook.SEGMENTED}) { border-radius: min(var(--dnpp-radius), 10px); }
${segments} { border-radius: min(calc(var(--dnpp-radius) - 4px), 6px); }
${root} :is(${hook.SKELETON}) { border-radius: min(var(--dnpp-radius), 8px); }`;

  switch (theme.motifs.controls) {
    case 'flat':
      break;

    case 'outlined':
      css += `
${tabs} { font-family: var(--dnpp-display); font-weight: var(--dnpp-display-weight); }
${tabs}[aria-current="page"] > span:last-child:not(:first-child) { height: 4px; border-radius: 4px 4px 0 0; }
${root} :is(${hook.SEGMENTED}) { border: var(--dnpp-border) solid var(--dnpp-ink); }
${chips} { border: 2px solid var(--dnpp-ink); }
${checkbox} { border: 2px solid var(--dnpp-ink); border-radius: 6px; }`;
      break;

    case 'pill':
      // The current tab is a soft pill rather than an underline.
      css += `
${tabs} { font-family: var(--dnpp-display); font-weight: var(--dnpp-display-weight); }
${tabs} > span:first-child { margin-block: 6px; padding: 8px 16px; border-radius: 999px; }
${tabs}[aria-current="page"] > span:first-child { background-color: var(--primary-soft); color: var(--primary); }
${tabs}[aria-current="page"] > span:last-child:not(:first-child) { display: none; }
${tabs}:hover { background-color: transparent; }
${tabs}:hover > span:first-child { background-color: var(--accent); }
${root} :is(${hook.SEGMENTED}), ${segments}, ${segments} > span { border-radius: 999px; }
${checkbox} { border-radius: 6px; }`;
      break;

    case 'bevel':
      // Tabs on a 90s dialog: the current one raised and joined to the page, the rest flat behind it.
      css += `
${tabs} { font-family: var(--dnpp-display); }
${tabs}[aria-current="page"] {
  background-color: var(--card);
  box-shadow:
    inset 1px 1px 0 0 var(--dnpp-edge-light),
    inset -1px 0 0 0 var(--dnpp-ink),
    inset -2px 0 0 0 var(--dnpp-edge-dark);
}
${tabs}[aria-current="page"] > span:last-child:not(:first-child) { display: none; }
${root} :is(${hook.SEGMENTED}) {
  border: 0;
  border-radius: 0;
  box-shadow:
    inset 1px 1px 0 0 var(--dnpp-edge-dark),
    inset -1px -1px 0 0 var(--dnpp-edge-light);
}
${segments}, ${segments} > span { border-radius: 0; }
${segments}[aria-checked="true"] {
  box-shadow:
    inset -1px -1px 0 0 var(--dnpp-ink),
    inset 1px 1px 0 0 var(--dnpp-edge-light),
    inset -2px -2px 0 0 var(--dnpp-edge-dark);
}
${chips} {
  border: 0;
  border-radius: 0;
  box-shadow:
    inset -1px -1px 0 0 var(--dnpp-ink),
    inset 1px 1px 0 0 var(--dnpp-edge-light),
    inset -2px -2px 0 0 var(--dnpp-edge-dark);
}
${checkbox} {
  border: 0;
  border-radius: 0;
  box-shadow:
    inset 1px 1px 0 0 var(--dnpp-edge-dark),
    inset -1px -1px 0 0 var(--dnpp-edge-light),
    inset 2px 2px 0 0 var(--dnpp-ink);
}
${checkbox}:not([data-state="checked"]) { background-color: var(--card); }
${root} :is(${hook.MENU_ITEMS}) { border-radius: 0; }
${root} :is(${hook.MENU_ITEMS})[data-highlighted] {
  background-color: var(--dnpp-chrome-start);
  color: var(--dnpp-chrome-foreground);
}`;
      break;
  }

  return css;
}

/** Floating surfaces: toasts, the docked messages, and the shade behind a dialog. */
function surfaces(theme: ThemeDefinition, root: string): string {
  const shadowed = theme.depth.overlay.kind !== 'none';
  let css = `
${root} :is(${hook.DIALOG_OVERLAY}) { background-color: rgb(var(--dnpp-ink-rgb) / 0.6); }
${root} :is(${hook.TOAST}) {
  border: var(--dnpp-border) solid var(--border);
  border-radius: var(--dnpp-radius);
  font-family: var(--font-sans);${shadowed ? '\n  box-shadow: var(--dnpp-overlay-shadow);' : ''}
}
${root} :is(${hook.CHAT_DOCK}) {
  border-width: var(--dnpp-border);
  border-bottom-width: 0;
  border-radius: var(--dnpp-radius) var(--dnpp-radius) 0 0;${shadowed ? '\n  box-shadow: var(--dnpp-overlay-shadow);' : ''}
}`;

  if (theme.motifs.post === 'window') {
    css += `
${root} :is(${hook.CHAT_DOCK}) {
  border: 0;
  border-radius: 0;
  padding: 3px 3px 0;
  box-shadow:
    inset -1px 0 0 0 var(--dnpp-ink),
    inset 1px 1px 0 0 var(--dnpp-edge-light),
    inset -2px 0 0 0 var(--dnpp-edge-dark)${shadowed ? ',\n    var(--dnpp-overlay-shadow)' : ''};
}
${root} :is(${hook.TOAST}) { border-radius: 0; }`;
  }

  return css;
}

function star(theme: ThemeDefinition, root: string): string {
  if (theme.motifs.star === 'star') {
    return '';
  }

  // The star's own icon stays, so its animation still plays, but draws a heart: the shape is a mask over its colour.
  const icon = `${root} :is(${hook.STAR_BUTTON}) > svg`;

  return `
${icon} {
  background-color: currentColor;
  mask: ${HEART_OUTLINE} center / contain no-repeat;
}
${icon} > * { visibility: hidden; }
${root} :is(${hook.STAR_BUTTON})[aria-pressed="true"] > svg { mask-image: ${HEART_FILLED}; }`;
}

function nav(theme: ThemeDefinition, root: string): string {
  const links = `${root} :is(${hook.NAV_LINKS})`;

  switch (theme.motifs.nav) {
    case 'plain':
      return '';

    case 'link-list':
      // A plain list of links, like a reference site's sidebar. Icons stay while the menu is collapsed to icons.
      return `
${links} { color: var(--dnpp-link); font-size: 14px; }
${links}[aria-current="page"] { color: var(--foreground); font-weight: 700; }
${links} > span:first-child:not(:last-child) { background: transparent; }
${links}:hover { text-decoration: underline; }
@media (min-width: 64rem) {
  ${root} ${hook.NAV_EXPANDED} :is(${hook.NAV_LINKS}) svg { display: none; }
}`;

    case 'start-menu':
      // The navigation as a start menu: a raised panel with a band down its side and a highlighted row per item.
      return `
${root} :is(${hook.NAV_HEADER}) {
  position: relative;
  margin: 8px;
  padding-left: 30px;
  background-color: var(--background);
  box-shadow:
    inset -1px -1px 0 0 var(--dnpp-ink),
    inset 1px 1px 0 0 var(--dnpp-edge-light),
    inset -2px -2px 0 0 var(--dnpp-edge-dark),
    inset 2px 2px 0 0 var(--background);
}
${root} :is(${hook.NAV_HEADER})::before {
  content: '';
  position: absolute;
  inset: 3px auto 3px 3px;
  width: 22px;
  background: linear-gradient(0deg, var(--dnpp-chrome-start), var(--dnpp-chrome-end));
}
${links} { border-radius: 0; font-family: var(--dnpp-display); color: var(--foreground); }
${links} > span:first-child:not(:last-child) { border-radius: 0; background: transparent; }
${links}:hover, ${links}[aria-current="page"] {
  background-color: var(--dnpp-chrome-start);
  color: var(--dnpp-chrome-foreground);
}`;
  }
}

function headings(theme: ThemeDefinition, root: string): string {
  switch (theme.motifs.headings) {
    case 'plain':
      return '';

    case 'ruled':
      return `
${root} :is(${hook.PAGE_TITLE}, ${hook.ASIDE_HEADING}) {
  padding-bottom: 2px;
  border-bottom: 1px solid var(--border);
  font-weight: 400;
}
${root} :is(${hook.PAGE_TITLE}) { font-size: 1.75rem; }`;

    case 'title-bar':
      // Headings only: the page's sticky header also holds the feed's tabs, which are drawn in the page's colours.
      return `
${root} :is(${hook.ASIDE_HEADING}) {
  padding: 2px 6px;
  background: linear-gradient(90deg, var(--dnpp-chrome-start), var(--dnpp-chrome-end));
  color: var(--dnpp-chrome-foreground);
}`;
  }
}

/** Sidebar blocks, and the profile card. */
function aside(theme: ThemeDefinition, root: string): string {
  let css = '';

  if (theme.motifs.post === 'bubble' || theme.motifs.post === 'window') {
    css += `
${root} :is(${hook.ASIDE_SECTION}) {
  padding: 12px;
  border: var(--dnpp-border) solid var(--border);
  border-radius: var(--dnpp-radius);
  background-color: var(--card);
  box-shadow: var(--dnpp-card-shadow);
}`;
  }

  if (theme.motifs.post === 'bubble' || theme.motifs.post === 'window') {
    // The rest of the sidebar (search, the footer's links) would sit on the backdrop, which text is not measured
    // against, so it gets the page colour behind it.
    css += `
${root} :is(${hook.ASIDE}) > :not(section, [data-dnpp]) {
  padding: 6px 10px;
  border-radius: var(--dnpp-radius);
  background-color: var(--background);
}`;
  }

  if (theme.motifs.post === 'window') {
    css += `
${root} :is(${hook.ASIDE_SECTION}) {
  border: 0;
  padding: 4px 8px 8px;
  box-shadow:
    inset -1px -1px 0 0 var(--dnpp-ink),
    inset 1px 1px 0 0 var(--dnpp-edge-light),
    inset -2px -2px 0 0 var(--dnpp-edge-dark),
    inset 2px 2px 0 0 var(--background);
}`;
  }

  if (theme.motifs.profile === 'infobox') {
    // An infobox: a bordered box of label and value rows.
    css += `
${root} :is(${hook.ASIDE_PROFILE}) {
  padding: 8px;
  border: 1px solid var(--border);
  background-color: var(--muted);
}
${root} :is(${hook.ASIDE_PROFILE}) > dl { display: block; text-align: left; }
${root} :is(${hook.ASIDE_PROFILE}) > dl > div {
  flex-direction: row;
  justify-content: space-between;
  padding: 3px 0;
  border-top: 1px solid var(--border);
}
${root} :is(${hook.ASIDE_PROFILE}) > dl dt { font-weight: 700; }
${root} :is(${hook.PROFILE_HEADER}) dl {
  flex-direction: column;
  gap: 0;
  max-width: 22rem;
  border: 1px solid var(--border);
  background-color: var(--muted);
}
${root} :is(${hook.PROFILE_HEADER}) dl > * { padding: 3px 8px; border-top: 1px solid var(--border); }
${root} :is(${hook.PROFILE_HEADER}) dl > :first-child { border-top: 0; }`;
  }

  return css;
}

function ornaments(theme: ThemeDefinition, root: string): string {
  const card = `${root} :is(${hook.POST_CONTENT})`;

  switch (theme.motifs.ornaments) {
    case 'none':
      return '';

    case 'sparkles':
      // A sparkle that pops out of a commit's corner on hover.
      return `
${card} { position: relative; }
${card}::after {
  content: '';
  position: absolute;
  top: -9px;
  right: -7px;
  width: 18px;
  height: 18px;
  background-color: var(--dnpp-highlight);
  mask: ${SPARKLE} center / contain no-repeat;
  scale: 0;
  rotate: -30deg;
  pointer-events: none;
  transition: scale var(--dnpp-duration) cubic-bezier(0.34, 1.56, 0.64, 1), rotate var(--dnpp-duration) ease;
}
${card}:hover::after { scale: 1; rotate: 0deg; }`;

    case 'bows':
      // A little bow on every commit's corner, and a sparkle on the star when it is pressed.
      return `
${card} { position: relative; }
${card}::after {
  content: '';
  position: absolute;
  top: -10px;
  right: 14px;
  width: 22px;
  height: 22px;
  background-color: var(--dnpp-highlight);
  mask: ${BOW} center / contain no-repeat;
  rotate: 12deg;
  pointer-events: none;
}`;
  }
}

/** A repeating texture, layered over the backdrop on <html>. */
function texture(theme: ThemeDefinition, root: string): string {
  const layer = (image: string, size: string): string => `
${root} { --dnpp-texture: ${image}; --dnpp-texture-size: ${size}; }`;

  switch (theme.motifs.texture) {
    case 'none':
      return '';
    case 'halftone':
      return layer(
        'radial-gradient(circle at center, rgb(var(--dnpp-ink-rgb) / 0.16) 1.3px, transparent 1.8px)',
        '8px 8px',
      );
    case 'speed-lines':
      return layer(
        'repeating-conic-gradient(from 0deg at 50% 38%, rgb(255 255 255 / 0.13) 0deg 1.2deg, transparent 1.2deg 6deg)',
        'auto',
      );
    case 'dither':
      return layer(
        'conic-gradient(rgb(var(--dnpp-ink-rgb) / 0.07) 25%, transparent 0 50%, rgb(var(--dnpp-ink-rgb) / 0.07) 0 75%, transparent 0)',
        '2px 2px',
      );
  }
}

function hover(theme: ThemeDefinition, root: string): string {
  const cards = `${root} :is(${hook.POST_CONTENT})`;

  switch (theme.motifs.hover) {
    case 'none':
      return '';
    case 'lift':
      return `
@media (prefers-reduced-motion: no-preference) and (hover: hover) {
  ${cards} { transition: translate var(--dnpp-duration) ease, box-shadow var(--dnpp-duration) ease; }
  ${cards}:hover { translate: 0 -2px; }
}`;
    case 'bounce':
      return `
@keyframes dnpp-bounce { 0%, 100% { translate: 0 0; } 40% { translate: 0 -4px; } 70% { translate: 0 1px; } }
@media (prefers-reduced-motion: no-preference) and (hover: hover) {
  ${root} :is(${hook.BUTTON}):hover:not(:disabled) { animation: dnpp-bounce calc(var(--dnpp-duration) * 2) ease; }
}`;
  }
}

function scrollbar(theme: ThemeDefinition, root: string): string {
  if (theme.motifs.scrollbar === 'thin') {
    return '';
  }

  // Chunky, bevelled scrollbars. Chromium only draws these when scrollbar-color is left alone; Firefox gets colours.
  return `
${root} { scrollbar-width: auto; scrollbar-color: auto; }
${root} ::-webkit-scrollbar { width: 16px; height: 16px; background-color: var(--muted); }
${root} ::-webkit-scrollbar-thumb {
  background-color: var(--background);
  box-shadow:
    inset -1px -1px 0 0 var(--dnpp-ink),
    inset 1px 1px 0 0 var(--dnpp-edge-light),
    inset -2px -2px 0 0 var(--dnpp-edge-dark);
}
@supports not selector(::-webkit-scrollbar) {
  ${root} { scrollbar-color: var(--dnpp-edge-dark) var(--muted); }
}`;
}

/** The full stylesheet for a theme. */
export function compileTheme(theme: ThemeDefinition): string {
  const root = `:root[${THEME_ATTRIBUTE}="${theme.id}"]`;

  return [
    // The id, not the name: the id is checked to be letters, digits and dashes, so it cannot end the comment.
    `/* /dev/null++ theme: ${theme.id} */`,
    fontFaces([theme.type.sans, theme.type.mono, theme.type.display]),
    tokens(theme, root),
    base(theme, root),
    controls(theme, root),
    posts(theme, root),
    embeds(theme, root),
    widgets(theme, root),
    surfaces(theme, root),
    star(theme, root),
    nav(theme, root),
    headings(theme, root),
    aside(theme, root),
    ornaments(theme, root),
    texture(theme, root),
    hover(theme, root),
    scrollbar(theme, root),
  ].join('\n');
}
