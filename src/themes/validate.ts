import { isHex } from './color';
import {
  CONTROL_MOTIFS,
  FONT_IDS,
  HEADING_MOTIFS,
  HOVER_MOTIFS,
  NAV_MOTIFS,
  ORNAMENT_MOTIFS,
  PALETTE_COLOURS,
  POST_MOTIFS,
  PRESS_MOTIFS,
  PROFILE_MOTIFS,
  SCHEMES,
  SCROLLBAR_MOTIFS,
  STAR_MOTIFS,
  TEXTURE_MOTIFS,
  THEME_ID,
  type Motifs,
  type ThemeDefinition,
} from './schema';

/**
 * Checks a theme in full: every field there, of the right kind, in range, and nothing else. The presets go through it
 * in the tests, and anything read back from storage goes through it before it is used, so the engine only ever sees
 * themes it can draw.
 */

export type Validation = { ok: true; theme: ThemeDefinition } | { ok: false; errors: string[] };

type Check = (value: unknown, path: string, errors: string[]) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      errors.push(`${path}.${key} is not a theme field`);
    }
  }
}

const object =
  (fields: Record<string, Check>): Check =>
  (value, path, errors) => {
    if (!isRecord(value)) {
      errors.push(`${path} must be an object`);

      return;
    }

    exactKeys(value, Object.keys(fields), path, errors);

    for (const [key, check] of Object.entries(fields)) {
      check(value[key], `${path}.${key}`, errors);
    }
  };

const hex: Check = (value, path, errors) => {
  if (!isHex(value)) {
    errors.push(`${path} must be a #rrggbb colour`);
  }
};

const hexList =
  (min: number, max: number): Check =>
  (value, path, errors) => {
    if (!Array.isArray(value) || value.length < min || value.length > max) {
      errors.push(`${path} must list ${String(min)} to ${String(max)} colours`);

      return;
    }

    value.forEach((item: unknown, index) => {
      hex(item, `${path}[${String(index)}]`, errors);
    });
  };

const number =
  (min: number, max: number): Check =>
  (value, path, errors) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      errors.push(`${path} must be a number from ${String(min)} to ${String(max)}`);
    }
  };

const oneOf =
  (options: readonly string[]): Check =>
  (value, path, errors) => {
    if (typeof value !== 'string' || !options.includes(value)) {
      errors.push(`${path} must be one of ${options.join(', ')}`);
    }
  };

const text =
  (max: number): Check =>
  (value, path, errors) => {
    if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
      errors.push(`${path} must be text of at most ${String(max)} characters`);
    }
  };

const shadow: Check = (value, path, errors) => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);

    return;
  }

  switch (value.kind) {
    case 'none':
      object({ kind: () => undefined })(value, path, errors);
      break;
    case 'soft':
      object({ kind: () => undefined, y: number(0, 32), blur: number(0, 64), opacity: number(0, 0.6) })(
        value,
        path,
        errors,
      );
      break;
    case 'hard':
      object({ kind: () => undefined, x: number(-12, 12), y: number(-12, 12) })(value, path, errors);
      break;
    default:
      errors.push(`${path}.kind must be one of none, soft, hard`);
  }
};

const palette = object({
  ...Object.fromEntries(PALETTE_COLOURS.map((name) => [name, hex])),
  lanes: hexList(6, 6),
  backdrop: hexList(1, 4),
});

const motifs = object({
  post: oneOf(POST_MOTIFS),
  nav: oneOf(NAV_MOTIFS),
  star: oneOf(STAR_MOTIFS),
  ornaments: oneOf(ORNAMENT_MOTIFS),
  texture: oneOf(TEXTURE_MOTIFS),
  headings: oneOf(HEADING_MOTIFS),
  profile: oneOf(PROFILE_MOTIFS),
  controls: oneOf(CONTROL_MOTIFS),
  press: oneOf(PRESS_MOTIFS),
  hover: oneOf(HOVER_MOTIFS),
  scrollbar: oneOf(SCROLLBAR_MOTIFS),
} satisfies Record<keyof Motifs, Check>);

const theme = object({
  id: (value, path, errors) => {
    if (typeof value !== 'string' || !THEME_ID.test(value)) {
      errors.push(`${path} must be lowercase letters, digits and dashes`);
    }
  },
  name: text(40),
  tagline: text(120),
  signature: oneOf(SCHEMES),
  palettes: object(Object.fromEntries(SCHEMES.map((scheme) => [scheme, palette]))),
  type: object({
    sans: oneOf(FONT_IDS),
    mono: oneOf(FONT_IDS),
    display: oneOf(FONT_IDS),
    displayWeight: number(400, 900),
    displayTracking: number(-0.05, 0.1),
  }),
  shape: object({ radius: number(0, 28), border: number(1, 4) }),
  depth: object({ card: shadow, overlay: shadow }),
  motion: object({ duration: number(0, 400) }),
  motifs,
});

export function validateTheme(value: unknown): Validation {
  const errors: string[] = [];

  theme(value, 'theme', errors);

  return errors.length === 0 ? { ok: true, theme: value as ThemeDefinition } : { ok: false, errors };
}
