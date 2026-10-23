import fredoka from '@fontsource-variable/fredoka/files/fredoka-latin-wght-normal.woff2?url&inline';
import nunito from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url&inline';
import pixelify from '@fontsource-variable/pixelify-sans/files/pixelify-sans-latin-wght-normal.woff2?url&inline';

import type { FontId } from './schema';

/**
 * The fonts a theme can pick. Each is a fixed stack: themes choose by name and never write a font-family themselves.
 * Bundled fonts are inlined as data URLs (Latin only, variable weight), so nothing is fetched from anywhere and the
 * extension exposes no files to the page. Their licences are in public/licenses.
 */

interface Font {
  stack: string;
  /** For a bundled font: its family name and the data URL of its file. */
  face?: { family: string; source: string; weights: string };
}

const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";
const SYSTEM_SANS = `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, ${EMOJI}`;

export const FONTS: Record<FontId, Font> = {
  geist: { stack: `'Geist', ${SYSTEM_SANS}` },
  'geist-mono': { stack: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  fredoka: {
    stack: `'dnpp Fredoka', 'Nunito', ${SYSTEM_SANS}`,
    face: { family: 'dnpp Fredoka', source: fredoka, weights: '300 700' },
  },
  nunito: {
    stack: `'dnpp Nunito', ${SYSTEM_SANS}`,
    face: { family: 'dnpp Nunito', source: nunito, weights: '200 1000' },
  },
  pixelify: {
    stack: `'dnpp Pixelify Sans', 'Courier New', monospace`,
    face: { family: 'dnpp Pixelify Sans', source: pixelify, weights: '400 700' },
  },
  'system-sans': { stack: SYSTEM_SANS },
  // Wikipedia's own reading serif first, then what every system has.
  'system-serif': { stack: "'Linux Libertine', 'Georgia', 'Times', 'Source Serif Pro', serif" },
  'system-mono': { stack: "Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace" },
  // A 90s desktop's UI fonts, where they are still installed, then their closest living relatives.
  'retro-sans': {
    stack: `'MS Sans Serif', 'Microsoft Sans Serif', 'Pixelated MS Sans Serif', Tahoma, Geneva, 'Segoe UI', sans-serif, ${EMOJI}`,
  },
  'retro-mono': { stack: "'Fixedsys Excelsior', 'Lucida Console', 'Courier New', monospace" },
};

/** @font-face rules for the bundled fonts among `ids`, each once. */
export function fontFaces(ids: readonly FontId[]): string {
  return [...new Set(ids)]
    .map((id) => FONTS[id].face)
    .filter((face) => face !== undefined)
    .map(
      (face) =>
        `@font-face { font-family: '${face.family}'; src: url('${face.source}') format('woff2'); font-weight: ${face.weights}; font-style: normal; font-display: block; }`,
    )
    .join('\n');
}
