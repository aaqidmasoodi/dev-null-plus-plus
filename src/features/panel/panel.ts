import { createLogoMark, createWordmark } from '@/core/brand';
import { EXTENSION_NAME } from '@/core/constants';
import { createSvgIcon, markOwned, ownedSelector } from '@/core/dom';
import { CLOSE_ICON } from '@/core/icons';

import styles from './panel.css?inline';

export const PANEL_ROLE = 'panel-host';

/**
 * Keys typed inside the panel must not reach the site. dev-null.sh binds single-key shortcuts on the document (`c` to
 * compose, `/` to search, and so on). Events leaving a shadow root are retargeted to the host element, which the site
 * would treat as typing on the page.
 */
const ISOLATED_EVENTS = ['keydown', 'keyup', 'keypress'] as const;

export interface PanelOptions {
  version: string;
  onOpenChange?: (open: boolean) => void;
}

/**
 * The dev/null++ panel: a modal dialog in a closed shadow root attached to `<body>`, outside the React root, so the
 * site's re-renders never touch it.
 *
 * It uses a native `<dialog>` opened with `showModal()`, which gives the top layer, a backdrop, focus containment,
 * Escape to close and focus return for free.
 */
export class Panel {
  readonly #host: HTMLElement;
  readonly #dialog: HTMLDialogElement;
  readonly #onOpenChange: ((open: boolean) => void) | undefined;

  constructor({ version, onOpenChange }: PanelOptions) {
    this.#onOpenChange = onOpenChange;

    for (const stray of document.querySelectorAll(ownedSelector(PANEL_ROLE))) {
      stray.remove();
    }

    this.#host = document.createElement('div');
    markOwned(this.#host, PANEL_ROLE);

    const shadow = this.#host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');

    style.textContent = styles;
    this.#dialog = this.#render(version);
    shadow.append(style, this.#dialog);

    for (const type of ISOLATED_EVENTS) {
      this.#host.addEventListener(type, (event) => {
        event.stopPropagation();
      });
    }

    this.#dialog.addEventListener('close', () => {
      this.#onOpenChange?.(false);
    });
    // A click on the dialog element itself, rather than its content, is a click on the backdrop.
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog && !this.#isInside(event)) {
        this.close();
      }
    });

    document.body.append(this.#host);
  }

  /** For tests. The shadow root is closed, so page scripts cannot reach in, and neither can tests without this. */
  get dialog(): HTMLDialogElement {
    return this.#dialog;
  }

  get isOpen(): boolean {
    return this.#dialog.open;
  }

  open(): void {
    if (this.#dialog.open) {
      return;
    }

    // The site's code or a page swap may have detached the host. Put it back before opening.
    if (!this.#host.isConnected) {
      document.body.append(this.#host);
    }

    this.#dialog.showModal();
    this.#onOpenChange?.(true);
  }

  close(): void {
    if (this.#dialog.open) {
      this.#dialog.close();
    }
  }

  toggle(): void {
    if (this.#dialog.open) {
      this.close();
    } else {
      this.open();
    }
  }

  destroy(): void {
    this.close();
    this.#host.remove();
  }

  #isInside(event: MouseEvent): boolean {
    const rect = this.#dialog.getBoundingClientRect();

    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  #render(version: string): HTMLDialogElement {
    const dialog = document.createElement('dialog');

    dialog.setAttribute('aria-labelledby', 'dnpp-title');
    dialog.dataset.test = 'dnpp-panel';

    const header = document.createElement('header');
    const mark = document.createElement('span');

    mark.className = 'mark';
    mark.append(createLogoMark(''));

    const heading = document.createElement('div');

    heading.className = 'heading';

    const title = document.createElement('h2');

    title.id = 'dnpp-title';
    title.append(createWordmark());

    const versionLine = document.createElement('p');

    versionLine.className = 'version';
    versionLine.textContent = `v${version}`;
    heading.append(title, versionLine);

    const close = document.createElement('button');

    close.type = 'button';
    close.className = 'close';
    close.setAttribute('aria-label', `Close ${EXTENSION_NAME}`);
    close.append(createSvgIcon(CLOSE_ICON, ''));
    close.addEventListener('click', () => {
      this.close();
    });

    header.append(mark, heading, close);

    const body = document.createElement('div');

    body.className = 'body';

    const status = document.createElement('p');
    const dot = document.createElement('span');

    status.className = 'status';
    dot.className = 'dot';
    dot.setAttribute('aria-hidden', 'true');
    status.append(dot, 'Installed and running');

    const about = document.createElement('p');

    about.textContent =
      'Extra powers for /dev/null. There is nothing to set up: new features appear here as they ship.';
    body.append(status, about);

    const footer = document.createElement('footer');

    footer.textContent = 'Everything runs in your browser.';

    dialog.append(header, body, footer);

    return dialog;
  }
}
