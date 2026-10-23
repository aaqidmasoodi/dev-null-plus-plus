import { CUSTOM_THEME_ID, parseCustomTheme, type CustomTheme } from '@/themes/custom';
import { DEFAULT_PRESET, isPresetId, type PresetId } from '@/themes/presets';

/**
 * The user's /dev/null++ settings: which features are on. Kept in `browser.storage.local`, which syncs between the
 * settings page, the composer and the background as soon as it changes. Nothing secret belongs here.
 *
 * Everything read back is validated, so a missing, old or tampered value falls back to the defaults instead of
 * breaking the extension.
 */

export interface Settings {
  features: {
    /** The AI rewrite button in the composer. */
    aiRewrite: boolean;
    /** Loading new commits as soon as the log's "N new commits" pill appears. */
    autoLoadNewCommits: boolean;
    /** Previewing a link in a dialog by pressing and holding it. */
    linkPreview: boolean;
    /** Peeking at an image, full size, by pressing and holding it. */
    imagePeek: boolean;
    /** Keeping a video playing in a floating player while scrolling and browsing. */
    pictureInPicture: boolean;
    /** A playing video floating by itself when scrolled past or its page is left. */
    autoPictureInPicture: boolean;
    /** "Who to follow" as a stack of swipeable cards instead of rows. */
    whoToFollowCards: boolean;
    /** Restyling the whole site with one of the theme presets. Off by default: installing never restyles the site. */
    themes: boolean;
    /** The brush on the edge of the page that opens the theme editor, while themes are on. */
    themeBrush: boolean;
    /** Checking GitHub once a day for a new version, and saying so on the page. */
    updateNotice: boolean;
  };
  theme: {
    /** Which theme, while themes are on: a preset, or the user's own. */
    preset: ThemeId;
    /** The user's own theme, once they have made one. */
    custom: CustomTheme | null;
  };
}

export type ThemeId = PresetId | typeof CUSTOM_THEME_ID;

export type FeatureName = keyof Settings['features'];

export const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  features: {
    aiRewrite: true,
    autoLoadNewCommits: true,
    linkPreview: true,
    imagePeek: true,
    pictureInPicture: true,
    autoPictureInPicture: true,
    whoToFollowCards: true,
    themes: false,
    themeBrush: true,
    updateNotice: true,
  },
  theme: { preset: DEFAULT_PRESET, custom: null },
};

export function parseSettings(value: unknown): Settings {
  const record = typeof value === 'object' && value !== null ? (value as { features?: unknown; theme?: unknown }) : {};
  const stored = record.features;
  const features = { ...DEFAULT_SETTINGS.features };

  // Only known switches, and only real booleans; anything else keeps its default.
  for (const name of Object.keys(features) as FeatureName[]) {
    const flag = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>)[name] : undefined;

    if (typeof flag === 'boolean') {
      features[name] = flag;
    }
  }

  const theme =
    typeof record.theme === 'object' && record.theme !== null
      ? (record.theme as { preset?: unknown; custom?: unknown })
      : {};
  // The user's own theme is checked in full, like anything else read back; one that fails is dropped, not repaired.
  const custom = parseCustomTheme(theme.custom);
  // Only a theme that ships, or the user's own if there is one; anything else is the default.
  const preset =
    isPresetId(theme.preset) || (theme.preset === CUSTOM_THEME_ID && custom !== null) ? theme.preset : DEFAULT_PRESET;

  return { features, theme: { preset, custom } };
}

export async function readSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);

  return parseSettings(stored[SETTINGS_KEY]);
}

export async function writeSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

/**
 * Settings plus the connected AI provider, kept current and observable. Content scripts use one of these to show,
 * hide and update features the moment the user changes something on the settings page.
 */
export class SettingsStore<T> {
  #value: T;
  readonly #listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.#value = initial;
  }

  get value(): T {
    return this.#value;
  }

  set(value: T): void {
    this.#value = value;

    for (const listener of this.#listeners) {
      listener(value);
    }
  }

  /** Calls `listener` on every change until `signal` aborts. */
  subscribe(listener: (value: T) => void, signal: AbortSignal): void {
    this.#listeners.add(listener);
    signal.addEventListener(
      'abort',
      () => {
        this.#listeners.delete(listener);
      },
      { once: true },
    );
  }
}
