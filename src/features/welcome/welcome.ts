import { createLogoMark } from '@/core/brand';
import { createSvgIcon, el, markOwned, ownedSelector } from '@/core/dom';
import { CLOSE_ICON } from '@/core/icons';
import { SPARKLES_ICON } from '@/features/ai-rewrite/composer-ai';
import { PIP_ICON } from '@/features/pip/cards';

import styles from './welcome.css?inline';

export const WELCOME_ROLE = 'welcome';
const SCROLL_LOCK_ROLE = 'welcome-lock';
/** Set on <html> while the welcome is open, to hold the page behind it still. */
const WELCOME_OPEN_ATTRIBUTE = 'data-dnpp-welcome';
/** In `browser.storage.local`: the welcome has been seen, so it never opens by itself again. */
export const WELCOMED_KEY = 'welcomed';

/** Lucide icons, to match the site's. */
const ICONS = {
  link: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ],
  image: [
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M11 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
  ],
  commit: ['M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M3 12h6', 'M15 12h6'],
  check: ['M20 6 9 17l-5-5'],
  back: ['m15 18-6-6 6-6'],
  next: ['m9 18 6-6-6-6'],
} as const;

export interface WelcomeStep {
  title: string;
  text: string;
  /** What the picture shows: the logo, or a feature's icon in one of the site's lane colours. */
  picture: { kind: 'logo' } | { kind: 'icon'; icon: readonly string[]; lane: number };
}

/** One step per feature, a line or two each. The picture area is where each feature will later show itself in motion. */
export const WELCOME_STEPS: readonly WelcomeStep[] = [
  {
    title: 'Welcome to /dev/null++',
    text: 'A few extra powers for /dev/null. They’re already on, so there’s nothing to set up.',
    picture: { kind: 'logo' },
  },
  {
    title: 'Rewrite with AI',
    text: 'Polish a draft before you commit it. Add your own AI key in settings and a button shows up in the composer.',
    picture: { kind: 'icon', icon: SPARKLES_ICON, lane: 2 },
  },
  {
    title: 'Link preview',
    text: 'Press and hold a link to open the page right over your log. Let go early and it’s gone.',
    picture: { kind: 'icon', icon: ICONS.link, lane: 3 },
  },
  {
    title: 'Image peek',
    text: 'Press and hold a picture to see it big. Let go and it goes back.',
    picture: { kind: 'icon', icon: ICONS.image, lane: 4 },
  },
  {
    title: 'Picture-in-picture',
    text: 'Videos keep playing in a corner while you scroll and move between pages.',
    picture: { kind: 'icon', icon: PIP_ICON, lane: 0 },
  },
  {
    title: 'New commits, on their own',
    text: 'At the top of your log, new commits load by themselves. No more clicking the pill.',
    picture: { kind: 'icon', icon: ICONS.commit, lane: 5 },
  },
  {
    title: 'You’re all set',
    text: 'Switch anything on or off from /dev/null++ in the menu, under Settings. Everything stays in this browser.',
    picture: { kind: 'icon', icon: ICONS.check, lane: 1 },
  },
];

export interface WelcomeOptions {
  /** Opens the /dev/null++ settings page. */
  onOpenSettings: () => void;
  signal: AbortSignal;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Someone typing, in the composer or anywhere else, is never interrupted. */
function isEditing(): boolean {
  const active = document.activeElement;

  return (
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'submit'].includes(active.type)) ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}

/**
 * A short tour of what dev/null++ adds, shown once, the first time dev-null.sh opens after installing. Seen once, in
 * any tab, it never opens by itself again; the settings page can show it again. It waits while someone is typing.
 */
export class Welcome {
  readonly #options: WelcomeOptions;
  #isPending = false;
  #host: HTMLElement | null = null;
  #dialog: HTMLDialogElement | null = null;
  #step = 0;
  #isClosing = false;

  constructor(options: WelcomeOptions) {
    this.#options = options;

    // Seen in another tab, it closes here too.
    const onChanged = (changes: Record<string, Browser.storage.StorageChange>, area: string): void => {
      if (area === 'local' && changes[WELCOMED_KEY]?.newValue === true) {
        this.#isPending = false;
        this.#remove();
      }
    };

    browser.storage.onChanged.addListener(onChanged);
    // Waiting for someone to stop typing: once focus has left the field, and not just moved to another one.
    document.addEventListener(
      'focusout',
      () => {
        setTimeout(() => {
          this.showIfPending();
        });
      },
      { signal: options.signal },
    );
    options.signal.addEventListener(
      'abort',
      () => {
        browser.storage.onChanged.removeListener(onChanged);
        this.destroy();
      },
      { once: true },
    );
  }

  get isOpen(): boolean {
    return this.#dialog?.open === true;
  }

  /** Opens the welcome if it has never been seen, as soon as nobody is typing. */
  async start(): Promise<void> {
    const stored = await browser.storage.local.get(WELCOMED_KEY);

    if (stored[WELCOMED_KEY] !== true && !this.#options.signal.aborted) {
      this.#isPending = true;
      this.showIfPending();
    }
  }

  /** Cheap, so it can run on every change to the page: a welcome that had to wait opens once typing stops. */
  showIfPending(): void {
    if (this.#isPending && !this.isOpen && !isEditing()) {
      this.#isPending = false;
      this.show();
    }
  }

  /** Opens the welcome at its first step, whether or not it has been seen. */
  show(): void {
    if (this.isOpen) {
      return;
    }

    this.#remove();
    this.#step = 0;
    this.#isClosing = false;

    const dialog = el('dialog', {
      attrs: { 'aria-labelledby': 'welcome-title', 'data-test': 'dnpp-welcome', tabindex: '-1' },
    });
    const host = el('div');

    markOwned(host, WELCOME_ROLE);
    host.attachShadow({ mode: 'open' }).append(el('style', {}, [styles]), dialog);
    // Keys pressed in the welcome must not reach the site's single-key shortcuts.
    host.addEventListener('keydown', (event) => {
      event.stopPropagation();

      if (event.key === 'ArrowRight') {
        this.#go(this.#step + 1);
      } else if (event.key === 'ArrowLeft') {
        this.#go(this.#step - 1);
      }
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    // A click on the dialog element itself, outside its card, is a click on the dimmed page.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        this.close();
      }
    });

    this.#host = host;
    this.#dialog = dialog;
    document.body.append(host);
    this.#render();
    this.#lockScroll(true);
    dialog.showModal();
    // The dialog itself takes focus rather than the ✕ that comes first, so no button wears a focus ring until the
    // keyboard reaches it. The arrow keys page through from the start.
    dialog.focus();

    if (!prefersReducedMotion()) {
      const timing = { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' };

      dialog.animate(
        [
          { opacity: 0, transform: 'scale(0.95)' },
          { opacity: 1, transform: 'none' },
        ],
        timing,
      );
      dialog.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, pseudoElement: '::backdrop' });
    }
  }

  /** Closes it, and remembers it was seen, here and in every other tab. */
  close(): void {
    const dialog = this.#dialog;

    if (dialog === null || this.#isClosing) {
      return;
    }

    this.#isClosing = true;
    void browser.storage.local.set({ [WELCOMED_KEY]: true });

    if (prefersReducedMotion()) {
      this.#remove();

      return;
    }

    const timing = { duration: 150, easing: 'ease-in', fill: 'forwards' } as const;

    dialog.animate([{ opacity: 0 }], { ...timing, pseudoElement: '::backdrop' });
    dialog.animate([{ opacity: 0, transform: 'scale(0.95)' }], timing).finished.then(
      () => {
        if (this.#dialog === dialog) {
          this.#remove();
        }
      },
      () => undefined,
    );
  }

  destroy(): void {
    this.#isPending = false;
    this.#remove();
  }

  #remove(): void {
    this.#dialog?.close();
    this.#host?.remove();
    this.#host = null;
    this.#dialog = null;
    this.#lockScroll(false);
  }

  #go(step: number): void {
    if (step < 0 || step >= WELCOME_STEPS.length || step === this.#step || this.#isClosing) {
      return;
    }

    const direction = step > this.#step ? 1 : -1;

    this.#step = step;
    this.#render();

    if (prefersReducedMotion()) {
      return;
    }

    // What is in the step slides, inside a box that stays put and clips it, so the dialog never grows sideways.
    for (const part of this.#dialog?.querySelectorAll('.content > *') ?? []) {
      part.animate([{ opacity: 0, transform: `translateX(${String(direction * 16)}px)` }, { opacity: 1 }], {
        duration: 220,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      });
    }
  }

  /**
   * Draws the current step. Its buttons are rebuilt each time, so focus moves to the one that now leads on. Before the
   * dialog opens, focusing does nothing, and the dialog takes focus itself.
   */
  #render(): void {
    const dialog = this.#dialog;
    const step = WELCOME_STEPS[this.#step];

    if (dialog === null || step === undefined) {
      return;
    }

    const isFirst = this.#step === 0;
    const isLast = this.#step === WELCOME_STEPS.length - 1;
    const button = (label: string, className: string, onClick: () => void, icon?: readonly string[]) => {
      const element = el('button', { className, attrs: { type: 'button' } }, [label]);

      if (icon !== undefined) {
        element.append(createSvgIcon(icon, ''));
      }

      element.addEventListener('click', onClick);

      return element;
    };
    const close = el('button', { className: 'close', attrs: { type: 'button', 'aria-label': 'Close' } }, [
      createSvgIcon(CLOSE_ICON, ''),
    ]);
    const dots = WELCOME_STEPS.map((_, index) => {
      const dot = el('button', {
        className: 'dot',
        attrs: { type: 'button', 'aria-label': `Step ${String(index + 1)} of ${String(WELCOME_STEPS.length)}` },
      });

      if (index === this.#step) {
        dot.setAttribute('aria-current', 'step');
      }

      dot.addEventListener('click', () => {
        this.#go(index);
      });

      return dot;
    });
    const lead = isLast
      ? button('Done', 'primary', () => {
          this.close();
        })
      : button(
          isFirst ? 'Show me' : 'Next',
          'primary',
          () => {
            this.#go(this.#step + 1);
          },
          ICONS.next,
        );
    const actions = el('div', { className: 'actions' }, [
      isLast
        ? button('Open settings', 'secondary', () => {
            this.close();
            this.#options.onOpenSettings();
          })
        : !isFirst &&
          button('Back', 'ghost', () => {
            this.#go(this.#step - 1);
          }),
      lead,
    ]);

    close.addEventListener('click', () => {
      this.close();
    });
    dialog.replaceChildren(
      el('div', { className: 'card' }, [
        close,
        el('div', { className: 'content' }, [
          this.#picture(step),
          el('div', { className: 'text' }, [
            el('h2', { attrs: { id: 'welcome-title' } }, [step.title]),
            el('p', {}, [step.text]),
          ]),
        ]),
        el('div', { className: 'footer' }, [el('div', { className: 'dots' }, dots), actions]),
      ]),
    );
    lead.focus();
  }

  #picture(step: WelcomeStep): HTMLElement {
    const { picture } = step;

    if (picture.kind === 'logo') {
      return el('div', { className: 'picture', attrs: { 'data-kind': 'logo', 'aria-hidden': 'true' } }, [
        createLogoMark('logo'),
      ]);
    }

    const element = el('div', { className: 'picture', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { className: 'badge' }, [createSvgIcon(picture.icon, '')]),
    ]);

    element.style.setProperty('--tint', `var(--lane-${String(picture.lane)})`);

    return element;
  }

  /** Holds the page behind still while the welcome is open. */
  #lockScroll(locked: boolean): void {
    const root = document.documentElement;

    if (!locked) {
      root.removeAttribute(WELCOME_OPEN_ATTRIBUTE);

      return;
    }

    if (document.head.querySelector(ownedSelector(SCROLL_LOCK_ROLE)) === null) {
      // The scrollbar's space is kept, so the page does not shift sideways as it is held still.
      const style = el('style', {}, [
        `html[${WELCOME_OPEN_ATTRIBUTE}] { overflow: hidden !important; scrollbar-gutter: stable !important; }`,
      ]);

      markOwned(style, SCROLL_LOCK_ROLE);
      document.head.append(style);
    }

    root.setAttribute(WELCOME_OPEN_ATTRIBUTE, '');
  }
}
