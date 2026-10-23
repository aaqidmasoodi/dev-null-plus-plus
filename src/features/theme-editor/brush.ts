import { createSvgIcon, el, markOwned, ownedSelector } from '@/core/dom';
import type { ExtensionState } from '@/core/extension-state';
import type { SettingsStore } from '@/core/settings';

import styles from './brush.css?inline';

export const BRUSH_ROLE = 'theme-brush';

/** Lucide's paintbrush, to match the site's icons. */
const PAINTBRUSH = [
  'm14.622 17.897-10.68-2.913',
  'M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z',
  'M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15',
] as const;

export interface ThemeBrushOptions {
  store: SettingsStore<ExtensionState>;
  onOpen: () => void;
  /** While the editor is open, the brush steps aside. */
  isEditorOpen: () => boolean;
  signal: AbortSignal;
}

/**
 * A small tab on the left edge of the page, with a paintbrush, that opens the theme editor. Only there while themes are
 * on and the brush is (settings, Themes); drawn in the theme's own colours, as part of the page.
 */
export class ThemeBrush {
  readonly #options: ThemeBrushOptions;
  readonly #host: HTMLElement;
  readonly #button: HTMLButtonElement;

  constructor(options: ThemeBrushOptions) {
    this.#options = options;

    for (const stray of document.querySelectorAll(ownedSelector(BRUSH_ROLE))) {
      stray.remove();
    }

    this.#button = el(
      'button',
      { attrs: { type: 'button', 'aria-label': 'Edit your theme', title: 'Edit your theme' } },
      [createSvgIcon(PAINTBRUSH, '')],
    );
    this.#button.addEventListener('click', () => {
      options.onOpen();
      this.sync();
    });
    this.#host = el('div');
    markOwned(this.#host, BRUSH_ROLE);
    this.#host.attachShadow({ mode: 'open' }).append(el('style', {}, [styles]), this.#button);

    options.store.subscribe(() => {
      this.sync();
    }, options.signal);
    options.signal.addEventListener(
      'abort',
      () => {
        this.destroy();
      },
      { once: true },
    );
  }

  /** Shows or hides the brush, and puts it back if the page took it away. */
  sync(): void {
    const { features } = this.#options.store.value.settings;
    const shown = features.themes && features.themeBrush && !this.#options.isEditorOpen();

    if (!shown) {
      this.#host.remove();

      return;
    }

    if (!this.#host.isConnected) {
      document.body.append(this.#host);
    }
  }

  focus(): void {
    this.#button.focus();
  }

  destroy(): void {
    this.#host.remove();
  }
}
