import { AI_STATUS_KEY, parseAiStatus, type AiStatus } from '@/core/ai';
import { parseSettings, SETTINGS_KEY, SettingsStore, type Settings } from '@/core/settings';

/** Everything content scripts need to know about the user's choices. None of it is secret. */
export interface ExtensionState {
  settings: Settings;
  /** The connected AI provider and model, or `null` if no key is set. */
  ai: AiStatus | null;
}

/**
 * Loads the user's settings and the connected provider, and keeps them current as they change, whether on the
 * settings page in this tab, in another tab, or in the provider frame.
 */
export async function loadExtensionState(signal: AbortSignal): Promise<SettingsStore<ExtensionState>> {
  const stored = await browser.storage.local.get([SETTINGS_KEY, AI_STATUS_KEY]);
  const store = new SettingsStore<ExtensionState>({
    settings: parseSettings(stored[SETTINGS_KEY]),
    ai: parseAiStatus(stored[AI_STATUS_KEY]),
  });
  const onChanged = (changes: Record<string, Browser.storage.StorageChange>, area: string): void => {
    const settings: Browser.storage.StorageChange | undefined = changes[SETTINGS_KEY];
    const ai: Browser.storage.StorageChange | undefined = changes[AI_STATUS_KEY];

    if (area !== 'local' || (settings === undefined && ai === undefined)) {
      return;
    }

    store.set({
      settings: settings === undefined ? store.value.settings : parseSettings(settings.newValue),
      ai: ai === undefined ? store.value.ai : parseAiStatus(ai.newValue),
    });
  };

  browser.storage.onChanged.addListener(onChanged);
  signal.addEventListener(
    'abort',
    () => {
      browser.storage.onChanged.removeListener(onChanged);
    },
    { once: true },
  );

  return store;
}
