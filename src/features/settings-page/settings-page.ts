import { createWordmark } from '@/core/brand';
import { EXTENSION_NAME } from '@/core/constants';
import { markOwned, ownedSelector } from '@/core/dom';
import { findMain } from '@/site/selectors';
import { setTakeover } from '@/site/takeover';

import type { SettingsSection } from './sections';
import styles from './settings-page.css?inline';

export const SETTINGS_PAGE_ROLE = 'settings-page';

/** Matches the site's "<page> - /dev/null" titles. */
export const SETTINGS_TITLE = `${EXTENSION_NAME} - /dev/null`;

export interface SettingsPageOptions {
  sections: readonly SettingsSection[];
}

/**
 * The /dev/null++ settings page. It shows in the middle column in place of the site's page, laid out like the site's
 * own settings: a sticky title, then one block per section.
 *
 * It is rendered once, into a shadow root so the site's styles and ours never mix, and attached to or detached from
 * the column as it opens and closes. The column belongs to React, so {@link SettingsPage.ensure} runs on every DOM
 * change and re-attaches the page if React replaced the column.
 *
 * The shadow root is open so tests can look inside. Closing it would not keep secrets from the page anyway: page
 * scripts run first and can capture any shadow root. Anything secret will live on an extension page instead.
 */
export class SettingsPage {
  readonly #host: HTMLElement;
  #open = false;
  /** The title the site last asked for, to give back when the page closes. */
  #siteTitle: string | null = null;
  #titleObserver: MutationObserver | null = null;

  constructor({ sections }: SettingsPageOptions) {
    for (const stray of document.querySelectorAll(ownedSelector(SETTINGS_PAGE_ROLE))) {
      stray.remove();
    }

    this.#host = document.createElement('div');
    markOwned(this.#host, SETTINGS_PAGE_ROLE);

    const shadow = this.#host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');

    style.textContent = styles;
    shadow.append(style, this.#render(sections));
  }

  get isOpen(): boolean {
    return this.#open;
  }

  get host(): HTMLElement {
    return this.#host;
  }

  setOpen(open: boolean): void {
    if (open === this.#open) {
      return;
    }

    this.#open = open;

    if (open) {
      this.#holdTitle();
    } else {
      this.#releaseTitle();
    }

    this.ensure();
  }

  /** Attaches or detaches the page to match whether it is open. Idempotent, cheap when nothing changed. */
  ensure(): void {
    if (!this.#open) {
      if (this.#host.isConnected) {
        this.#host.remove();
      }

      setTakeover(null);

      return;
    }

    if (!this.#host.isConnected) {
      // When React replaces the column, the host leaves with the old one, so always look the column up afresh.
      const main = findMain();

      if (main === null) {
        return;
      }

      main.append(this.#host);
    }

    setTakeover(SETTINGS_PAGE_ROLE);
  }

  destroy(): void {
    this.setOpen(false);
  }

  /**
   * Keeps the tab title ours while open. Inertia's `<Head>` sets the title whenever the site's page renders, including
   * after we opened, so we watch for that, remember what the site wanted, and put ours back.
   */
  #holdTitle(): void {
    const apply = (): void => {
      if (document.title !== SETTINGS_TITLE) {
        this.#siteTitle = document.title;
        document.title = SETTINGS_TITLE;
      }
    };

    apply();
    this.#titleObserver = new MutationObserver(apply);
    this.#titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
  }

  /** Gives the site back the title it last asked for, unless it has already set a new one. */
  #releaseTitle(): void {
    this.#titleObserver?.disconnect();
    this.#titleObserver = null;

    if (document.title === SETTINGS_TITLE && this.#siteTitle !== null) {
      document.title = this.#siteTitle;
    }

    this.#siteTitle = null;
  }

  #render(sections: readonly SettingsSection[]): HTMLElement {
    const page = document.createElement('div');

    page.dataset.test = 'dnpp-settings';

    const header = document.createElement('div');
    const title = document.createElement('h1');

    header.className = 'header';
    title.setAttribute('aria-label', EXTENSION_NAME);
    title.append(createWordmark());
    header.append(title);
    page.append(header);

    for (const section of sections) {
      const block = document.createElement('section');
      const heading = document.createElement('header');
      const name = document.createElement('h2');
      const description = document.createElement('p');

      block.dataset.section = section.id;
      block.setAttribute('aria-labelledby', `dnpp-section-${section.id}`);
      heading.className = 'heading';
      name.id = `dnpp-section-${section.id}`;
      name.textContent = section.title;
      description.textContent = section.description;
      heading.append(name, description);
      block.append(heading, section.render());
      page.append(block);
    }

    return page;
  }
}
