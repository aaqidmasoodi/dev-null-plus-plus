import { createSvgIcon, el, markOwned, ownedSelector } from '@/core/dom';
import type { ExtensionState } from '@/core/extension-state';
import { CLOSE_ICON } from '@/core/icons';
import type { CheckUpdateMessage } from '@/core/messages';
import type { SettingsStore } from '@/core/settings';
import {
  availableUpdate,
  parseUpdateInfo,
  releasePage,
  UPDATE_DISMISSED_KEY,
  UPDATE_KEY,
  type UpdateInfo,
} from '@/core/updates';

import styles from './notice.css?inline';

export const NOTICE_ROLE = 'update-notice';

/** Lucide's `circle-arrow-up`. */
const UPDATE_ICON = ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'm16 12-4-4-4 4', 'M12 16V8'] as const;

/** Asks the background to look for a new version. It checks at most once a day, however often it is asked. */
export function requestUpdateCheck(): void {
  browser.runtime.sendMessage({ type: 'dnpp:check-update' } satisfies CheckUpdateMessage).catch(() => {
    // The extension was reloaded; the new copy asks again.
  });
}

export interface UpdateNoticeOptions {
  store: SettingsStore<ExtensionState>;
  /** The version running now. */
  version: string;
  signal: AbortSignal;
}

/**
 * A notice at the top of the page when a newer version is on GitHub, with a link to it. Closing it hides that version
 * for good; the next one shows again. Only there while update notices are on (settings, Updates).
 */
export class UpdateNotice {
  readonly #options: UpdateNoticeOptions;
  readonly #host: HTMLElement;
  readonly #text: HTMLElement;
  readonly #link: HTMLAnchorElement;
  #info: UpdateInfo | null = null;
  #dismissed: unknown = null;
  #latest: string | null = null;

  constructor(options: UpdateNoticeOptions) {
    this.#options = options;

    for (const stray of document.querySelectorAll(ownedSelector(NOTICE_ROLE))) {
      stray.remove();
    }

    this.#text = el('p');
    this.#link = el('a', { className: 'get', attrs: { target: '_blank', rel: 'noopener noreferrer' } });

    const close = el(
      'button',
      { className: 'close', attrs: { type: 'button', 'aria-label': 'Hide until the next version' } },
      [createSvgIcon(CLOSE_ICON, '')],
    );

    close.addEventListener('click', () => {
      if (this.#latest !== null) {
        void browser.storage.local.set({ [UPDATE_DISMISSED_KEY]: this.#latest });
      }

      this.#host.remove();
    });

    this.#host = el('div');
    markOwned(this.#host, NOTICE_ROLE);
    this.#host
      .attachShadow({ mode: 'open' })
      .append(
        el('style', {}, [styles]),
        el('div', { className: 'notice', attrs: { role: 'region', 'aria-label': 'New version' } }, [
          createSvgIcon(UPDATE_ICON, 'icon'),
          this.#text,
          this.#link,
          close,
        ]),
      );

    const onChanged = (changes: Record<string, Browser.storage.StorageChange>, area: string): void => {
      if (area !== 'local' || (!(UPDATE_KEY in changes) && !(UPDATE_DISMISSED_KEY in changes))) {
        return;
      }

      if (UPDATE_KEY in changes) {
        this.#info = parseUpdateInfo(changes[UPDATE_KEY].newValue);
      }

      if (UPDATE_DISMISSED_KEY in changes) {
        this.#dismissed = changes[UPDATE_DISMISSED_KEY].newValue;
      }

      this.sync();
    };

    browser.storage.onChanged.addListener(onChanged);
    options.store.subscribe(() => {
      this.sync();
    }, options.signal);
    options.signal.addEventListener(
      'abort',
      () => {
        browser.storage.onChanged.removeListener(onChanged);
        this.destroy();
      },
      { once: true },
    );
  }

  /** Reads what the background found, then shows the notice if there is something to say. */
  async start(): Promise<void> {
    const stored = await browser.storage.local.get([UPDATE_KEY, UPDATE_DISMISSED_KEY]);

    this.#info = parseUpdateInfo(stored[UPDATE_KEY]);
    this.#dismissed = stored[UPDATE_DISMISSED_KEY];
    this.sync();

    if (this.#options.store.value.settings.features.updateNotice) {
      requestUpdateCheck();
    }
  }

  sync(): void {
    const on = this.#options.store.value.settings.features.updateNotice;

    this.#latest = on ? availableUpdate(this.#options.version, this.#info, this.#dismissed) : null;

    if (this.#latest === null) {
      this.#host.remove();

      return;
    }

    this.#text.replaceChildren(
      el('strong', {}, [`/dev/null++ v${this.#latest} is out.`]),
      ' Reinstall it from GitHub to update.',
    );
    this.#link.href = releasePage(this.#latest);
    this.#link.textContent = `Get v${this.#latest}`;

    if (!this.#host.isConnected) {
      document.body.append(this.#host);
    }
  }

  destroy(): void {
    this.#host.remove();
  }
}
