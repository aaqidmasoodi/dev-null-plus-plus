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
  };
}

export const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  features: {
    aiRewrite: true,
  },
};

export function parseSettings(value: unknown): Settings {
  const features = typeof value === 'object' && value !== null ? (value as { features?: unknown }).features : undefined;
  const aiRewrite =
    typeof features === 'object' && features !== null ? (features as { aiRewrite?: unknown }).aiRewrite : undefined;

  return {
    features: {
      aiRewrite: typeof aiRewrite === 'boolean' ? aiRewrite : DEFAULT_SETTINGS.features.aiRewrite,
    },
  };
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
