import { createSvgIcon, el, markOwned, ownedSelector } from '@/core/dom';
import { CLOSE_ICON } from '@/core/icons';

import styles from './preview.css?inline';

export const PREVIEW_ROLE = 'link-preview';
const SCROLL_LOCK_ROLE = 'link-preview-lock';
/** Set on <html> while a preview is open, to hold the page behind it still. */
export const PREVIEW_OPEN_ATTRIBUTE = 'data-dnpp-preview';

/** Lucide icons, to match the site's. */
const ICONS = {
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  reload: ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
  copy: [
    'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
    'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  ],
  check: ['M20 6 9 17l-5-5'],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
} as const;

/** Widths for checking how a page responds. `null` fills the dialog. */
const SIZES = [
  { label: 'Phone', width: 390, height: 844 },
  { label: 'Tablet', width: 768, height: 1024 },
  { label: 'Desktop', width: null, height: null },
] as const;

type SizeLabel = (typeof SIZES)[number]['label'];

const MIN_SIZE = 280;
const SLOW_LOAD_MS = 8_000;

/**
 * The frame's sandbox. Pages can run, keep their own origin (so they work), submit forms and open real windows. They
 * cannot navigate the dev-null.sh tab, show alert dialogs that would freeze it, start downloads, or reach anything of
 * the page behind: they are a different origin, so the browser keeps the two apart.
 */
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function iconButton(label: string, icon: readonly string[]): HTMLButtonElement {
  return el('button', { attrs: { type: 'button', 'aria-label': label, title: label } }, [createSvgIcon(icon, '')]);
}

/**
 * A large dialog showing a link's page over a dimmed dev-null.sh, so a page can be read without leaving the log. It
 * pops out from where the link was pressed, can be resized or set to phone and tablet widths, and closes with ✕,
 * Escape or a click outside.
 *
 * The page loads like a private window:
 * - `credentialless`: it gets none of the user's cookies or saved logins for that site, and starts with empty, throwaway
 *   storage that is gone when the preview closes. Nothing can be taken that it is never given.
 * - Sandboxed, see {@link SANDBOX}.
 * - No referrer, so the site is not told the visit came from dev-null.sh, and no access to the camera, microphone,
 *   location or other powerful features.
 */
export class PreviewDialog {
  readonly #host: HTMLElement;
  readonly #dialog: HTMLDialogElement;
  readonly #hostName: HTMLElement;
  readonly #path: HTMLElement;
  readonly #stage: HTMLElement;
  readonly #viewport: HTMLElement;
  readonly #loading: HTMLElement;
  readonly #slowHint: HTMLElement;
  readonly #notice: HTMLElement;
  readonly #noticeLink: HTMLAnchorElement;
  readonly #openLink: HTMLAnchorElement;
  readonly #copy: HTMLButtonElement;
  readonly #sizeBadge: HTMLElement;
  readonly #sizeButtons = new Map<SizeLabel, HTMLButtonElement>();
  #frame: HTMLIFrameElement | null = null;
  #url: URL | null = null;
  #slowTimer = 0;
  #closing = false;

  constructor() {
    for (const stray of document.querySelectorAll(ownedSelector(PREVIEW_ROLE))) {
      stray.remove();
    }

    this.#hostName = el('span', { className: 'host' });
    this.#path = el('span', { className: 'path' });

    const close = iconButton('Close preview', CLOSE_ICON);
    const reload = iconButton('Reload', ICONS.reload);

    this.#copy = iconButton('Copy link', ICONS.copy);
    this.#openLink = el(
      'a',
      {
        className: 'action',
        attrs: {
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': 'Open in new tab',
          title: 'Open in new tab',
        },
      },
      [createSvgIcon(ICONS.external, '')],
    );

    const sizes = el(
      'div',
      { className: 'sizes', attrs: { role: 'group', 'aria-label': 'Preview width' } },
      SIZES.map(({ label }) => {
        const button = el('button', { attrs: { type: 'button', 'aria-pressed': 'false' } }, [label]);

        button.addEventListener('click', () => {
          this.#setSize(label);
        });
        this.#sizeButtons.set(label, button);

        return button;
      }),
    );

    this.#viewport = el('div', { className: 'viewport' }, [
      el('div', { className: 'handle e', attrs: { 'data-edge': 'e' } }),
      el('div', { className: 'handle s', attrs: { 'data-edge': 's' } }),
      el('div', { className: 'handle se', attrs: { 'data-edge': 'se' } }),
    ]);
    this.#slowHint = el('p', { className: 'hint', attrs: { hidden: '' } }, [
      'Taking a while? Open it in a new tab instead.',
    ]);
    this.#loading = el('div', { className: 'loading', attrs: { role: 'status' } }, [
      el('span', { className: 'spinner', attrs: { 'aria-hidden': 'true' } }),
      el('span', {}, ['Loading preview…']),
      this.#slowHint,
    ]);
    this.#noticeLink = el('a', { attrs: { target: '_blank', rel: 'noopener noreferrer' } }, ['Open in new tab']);
    this.#notice = el('div', { className: 'notice', attrs: { hidden: '' } }, [
      el('strong', {}, ['This page can’t be previewed here']),
      el('span', {}, [
        'It is not served over a secure connection, so the browser will not show it inside dev-null.sh.',
      ]),
      this.#noticeLink,
    ]);
    this.#sizeBadge = el('div', { className: 'size', attrs: { 'aria-hidden': 'true' } });
    this.#stage = el('div', { className: 'stage' }, [this.#viewport, this.#loading, this.#notice, this.#sizeBadge]);

    this.#dialog = el('dialog', { attrs: { 'aria-label': 'Link preview', 'data-test': 'dnpp-link-preview' } }, [
      el('div', { className: 'bar' }, [
        el('div', { className: 'address' }, [createSvgIcon(ICONS.lock, ''), this.#hostName, this.#path]),
        sizes,
        el('div', { className: 'actions' }, [reload, this.#copy, this.#openLink, close]),
      ]),
      this.#stage,
    ]);

    this.#host = el('div');
    markOwned(this.#host, PREVIEW_ROLE);
    this.#host.attachShadow({ mode: 'open' }).append(el('style', {}, [styles]), this.#dialog);

    close.addEventListener('click', () => {
      this.close();
    });
    reload.addEventListener('click', () => {
      this.#load();
    });
    this.#copy.addEventListener('click', () => {
      void this.#copyLink();
    });
    this.#dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    // A click on the dialog element itself, outside its content, is a click on the dimmed page: close.
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog && !this.#isInside(event)) {
        this.close();
      }
    });
    // Keys pressed in the preview's own controls must not reach the site's single-key shortcuts.
    this.#host.addEventListener('keydown', (event) => {
      event.stopPropagation();
    });
    this.#viewport.addEventListener('pointerdown', this.#onResizeStart);
  }

  get isOpen(): boolean {
    return this.#dialog.open;
  }

  /** The dialog, for tests. */
  get dialog(): HTMLDialogElement {
    return this.#dialog;
  }

  open(url: URL, origin: { x: number; y: number }): void {
    if (this.#dialog.open) {
      this.#teardownFrame();
    }

    this.#closing = false;
    this.#url = url;
    this.#hostName.textContent = url.host;
    this.#path.textContent = `${url.pathname}${url.search}`.replace(/^\/$/, '');
    this.#openLink.href = url.href;
    this.#noticeLink.href = url.href;
    this.#setSize('Desktop');

    if (!this.#host.isConnected) {
      document.body.append(this.#host);
    }

    this.#lockScroll(true);

    if (!this.#dialog.open) {
      this.#dialog.showModal();
      this.#popFrom(origin);
    }

    this.#load();
  }

  close(): void {
    if (!this.#dialog.open || this.#closing) {
      return;
    }

    this.#closing = true;

    const finish = (): void => {
      this.#teardownFrame();
      this.#dialog.close();
      this.#lockScroll(false);
      this.#closing = false;
    };

    if (prefersReducedMotion()) {
      finish();

      return;
    }

    const out = this.#dialog.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'scale(0.97)' },
      ],
      { duration: 150, easing: 'ease-in', fill: 'forwards' },
    );

    this.#dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 150,
      pseudoElement: '::backdrop',
      fill: 'forwards',
    });
    out.finished
      .catch(() => undefined)
      .finally(() => {
        finish();
        this.#dialog.getAnimations({ subtree: false }).forEach((animation) => {
          animation.cancel();
        });
      });
  }

  destroy(): void {
    this.#teardownFrame();

    if (this.#dialog.open) {
      this.#dialog.close();
    }

    this.#lockScroll(false);
    this.#host.remove();
  }

  /** Loads, or reloads, the page in a fresh frame. A new frame each time also means fresh, empty storage. */
  #load(): void {
    const url = this.#url;

    if (url === null) {
      return;
    }

    this.#teardownFrame();
    clearTimeout(this.#slowTimer);

    // An https page cannot show an http one inside it. Say so, rather than leave a blank frame.
    if (url.protocol !== 'https:') {
      this.#loading.hidden = true;
      this.#notice.hidden = false;

      return;
    }

    this.#notice.hidden = true;
    this.#loading.hidden = false;
    this.#slowHint.hidden = true;
    this.#slowTimer = window.setTimeout(() => {
      this.#slowHint.hidden = false;
    }, SLOW_LOAD_MS);

    const frame = el('iframe', {
      attrs: {
        title: `Preview of ${url.host}`,
        sandbox: SANDBOX,
        referrerpolicy: 'no-referrer',
        // No camera, microphone, location, payments or other powerful features.
        allow: '',
      },
    });

    // These must be in place before the frame starts loading.
    frame.setAttribute('credentialless', '');
    frame.addEventListener('load', () => {
      clearTimeout(this.#slowTimer);
      this.#loading.hidden = true;
    });
    frame.src = url.href;
    this.#viewport.append(frame);
    this.#frame = frame;
  }

  #teardownFrame(): void {
    clearTimeout(this.#slowTimer);
    // Leaving the page first stops anything still loading or playing in it.
    this.#frame?.setAttribute('src', 'about:blank');
    this.#frame?.remove();
    this.#frame = null;
  }

  #setSize(label: SizeLabel): void {
    const size = SIZES.find((candidate) => candidate.label === label);

    for (const [name, button] of this.#sizeButtons) {
      button.setAttribute('aria-pressed', String(name === label));
    }

    if (size === undefined || size.width === null) {
      this.#stage.removeAttribute('data-sized');
      this.#viewport.style.width = '';
      this.#viewport.style.height = '';

      return;
    }

    this.#stage.setAttribute('data-sized', '');
    this.#viewport.style.width = `${String(size.width)}px`;
    this.#viewport.style.height = `${String(size.height)}px`;
    this.#showSize();
  }

  /**
   * Dragging an edge or the corner resizes the page around its centre, like a browser's device toolbar, so both sides
   * move together and it stays centred.
   */
  readonly #onResizeStart = (event: PointerEvent): void => {
    const edge = event.target instanceof HTMLElement ? event.target.dataset.edge : undefined;

    if (edge === undefined || event.button !== 0) {
      return;
    }

    event.preventDefault();

    const stage = this.#stage.getBoundingClientRect();
    const centre = { x: stage.left + stage.width / 2, y: stage.top + stage.height / 2 };
    const handle = event.target as HTMLElement;

    handle.setPointerCapture(event.pointerId);
    this.#stage.setAttribute('data-dragging', '');
    this.#stage.setAttribute('data-sized', '');

    for (const button of this.#sizeButtons.values()) {
      button.setAttribute('aria-pressed', 'false');
    }

    const move = (moveEvent: PointerEvent): void => {
      if (edge.includes('e')) {
        const width = Math.min(Math.max(2 * (moveEvent.clientX - centre.x), MIN_SIZE), stage.width);

        this.#viewport.style.width = `${String(Math.round(width))}px`;
      }

      if (edge.includes('s')) {
        const height = Math.min(Math.max(2 * (moveEvent.clientY - centre.y), MIN_SIZE), stage.height);

        this.#viewport.style.height = `${String(Math.round(height))}px`;
      }

      this.#showSize();
    };
    const end = (): void => {
      handle.removeEventListener('pointermove', move);
      this.#stage.removeAttribute('data-dragging');
      this.#hideSizeSoon();
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end, { once: true });
    handle.addEventListener('pointercancel', end, { once: true });
  };

  #showSize(): void {
    const rect = this.#viewport.getBoundingClientRect();

    this.#sizeBadge.textContent = `${String(Math.round(rect.width))} × ${String(Math.round(rect.height))}`;
    this.#sizeBadge.setAttribute('data-show', '');
    this.#hideSizeSoon();
  }

  #sizeTimer = 0;

  #hideSizeSoon(): void {
    clearTimeout(this.#sizeTimer);
    this.#sizeTimer = window.setTimeout(() => {
      this.#sizeBadge.removeAttribute('data-show');
    }, 1_200);
  }

  async #copyLink(): Promise<void> {
    if (this.#url === null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(this.#url.href);
      this.#copy.replaceChildren(createSvgIcon(ICONS.check, ''));
      this.#copy.classList.add('copied');
      window.setTimeout(() => {
        this.#copy.replaceChildren(createSvgIcon(ICONS.copy, ''));
        this.#copy.classList.remove('copied');
      }, 1_500);
    } catch {
      // Copying needs focus and permission; the address is still there to select by hand.
    }
  }

  /** It pops out from where the link was pressed, as if the link grew into it, over a dimming page. */
  #popFrom(origin: { x: number; y: number }): void {
    if (prefersReducedMotion()) {
      return;
    }

    const rect = this.#dialog.getBoundingClientRect();

    this.#dialog.style.transformOrigin = `${String(origin.x - rect.left)}px ${String(origin.y - rect.top)}px`;
    this.#dialog.animate(
      [
        { opacity: 0, transform: 'scale(0.6)' },
        { opacity: 1, transform: 'scale(1.01)', offset: 0.75 },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 340, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    this.#dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, pseudoElement: '::backdrop' });
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

  /** Holds the page behind still while the preview is open, so scrolling in it never scrolls the log. */
  #lockScroll(locked: boolean): void {
    const root = document.documentElement;

    if (!locked) {
      root.removeAttribute(PREVIEW_OPEN_ATTRIBUTE);

      return;
    }

    if (document.head.querySelector(ownedSelector(SCROLL_LOCK_ROLE)) === null) {
      const style = el('style', {}, [`html[${PREVIEW_OPEN_ATTRIBUTE}] { overflow: hidden !important; }`]);

      markOwned(style, SCROLL_LOCK_ROLE);
      document.head.append(style);
    }

    root.setAttribute(PREVIEW_OPEN_ATTRIBUTE, '');
  }
}
