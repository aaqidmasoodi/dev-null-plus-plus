import {
  MAX_DRAFT_LENGTH,
  REWRITE_ERROR_MESSAGES,
  REWRITE_MODE_LABELS,
  REWRITE_MODES,
  type RewriteErrorCode,
  type RewriteMode,
  type RewriteResult,
} from '@/core/ai';
import { createSvgIcon, el, markOwned, ownedSelector } from '@/core/dom';
import { SETTINGS_HASH } from '@/core/route';
import type { SettingsStore } from '@/core/settings';
import { composerMaxLength, findComposers, setComposerText, type ComposerParts } from '@/site/composer';

import styles from './panel.css?inline';
import type { ExtensionState } from './state';

export const AI_BUTTON_ROLE = 'ai-button';
export const AI_PANEL_ROLE = 'ai-panel';

/** Lucide's "sparkles", to sit with the composer's other lucide icons. */
const SPARKLES_ICON = [
  'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
  'M20 3v4',
  'M22 5h-4',
  'M4 17v2',
  'M5 18H3',
];

/**
 * Highlighted while the panel is open, exactly like the site's schedule toggle. Added when the button copies its look
 * from the image button, which does not have them.
 */
const EXPANDED_CLASSES =
  'aria-expanded:bg-primary-soft aria-expanded:text-primary aria-expanded:hover:bg-primary-soft aria-expanded:hover:text-primary';

/** Errors the user fixes on the settings page, so the message links there. */
const SETTINGS_ERRORS: readonly RewriteErrorCode[] = ['disabled', 'not-configured', 'auth', 'model', 'quota'];

const PROVIDER_NAMES: Record<string, string> = {
  groq: 'Groq',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  xai: 'xAI',
  gemini: 'Google Gemini',
};

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Copies the anchor button's classes for ours. Drops position tweaks meant for the first button in the row, and lucide's
 * marker classes on the icon.
 */
function buttonClasses(anchor: HTMLElement): { button: string; icon: string } {
  const own = anchor.className.split(/\s+/).filter((name) => name !== '' && !/^-?m[lrxy]?-/.test(name));
  const icon = (anchor.querySelector('svg')?.getAttribute('class') ?? 'size-5')
    .split(/\s+/)
    .filter((name) => name !== '' && name !== 'lucide' && !name.startsWith('lucide-'));
  const button = own.join(' ').includes('aria-expanded:') ? own.join(' ') : `${own.join(' ')} ${EXPANDED_CLASSES}`;

  return { button, icon: icon.length > 0 ? icon.join(' ') : 'size-5' };
}

let panelCount = 0;

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; mode: RewriteMode }
  | { kind: 'done' }
  | { kind: 'error'; error: RewriteErrorCode };

export type RewriteRequester = (request: {
  text: string;
  mode: RewriteMode;
  maxLength: number;
}) => Promise<RewriteResult>;

/**
 * The AI button and panel for one composer. Owns its own state, and survives React re-rendering the toolbar by
 * putting its elements back on every {@link ComposerAiInstance.ensure}.
 */
class ComposerAiInstance {
  readonly #store: SettingsStore<ExtensionState>;
  readonly #request: RewriteRequester;
  readonly #button: HTMLButtonElement;
  readonly #icon: SVGSVGElement;
  readonly #host: HTMLElement;
  readonly #panelId = `dnpp-ai-panel-${String(++panelCount)}`;
  #parts: ComposerParts;
  #open = false;
  #status: Status = { kind: 'idle' };
  /** The draft before the last rewrite, for Undo. Cleared once the user edits the result. */
  #previous: string | null = null;
  #destroyed = false;
  #animations: Animation[] = [];

  constructor(parts: ComposerParts, store: SettingsStore<ExtensionState>, request: RewriteRequester) {
    this.#parts = parts;
    this.#store = store;
    this.#request = request;

    const classes = buttonClasses(parts.anchor);

    this.#icon = createSvgIcon(SPARKLES_ICON, classes.icon);
    this.#button = el('button', {
      className: classes.button,
      attrs: {
        type: 'button',
        'aria-label': 'Rewrite with AI',
        title: 'Rewrite with AI',
        'aria-expanded': 'false',
        'aria-controls': this.#panelId,
        'data-test': 'dnpp-ai-button',
      },
    });
    markOwned(this.#button, AI_BUTTON_ROLE);
    this.#button.append(this.#icon);
    this.#button.addEventListener('click', () => {
      this.#setOpen(!this.#open);
    });

    this.#host = el('div', { attrs: { id: this.#panelId } });
    markOwned(this.#host, AI_PANEL_ROLE);

    if (parts.kind === 'reply-composer') {
      this.#host.setAttribute('data-compact', '');
    }

    const shadow = this.#host.attachShadow({ mode: 'open' });

    shadow.append(el('style', {}, [styles]), el('div'));
    // Typing in the panel must not reach the site's single-key shortcuts.
    this.#host.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.#setOpen(false);
        this.#button.focus();
      }

      event.stopPropagation();
    });

    // Once the user edits the rewritten text, Undo would throw their edits away, so it goes.
    parts.textarea.addEventListener('input', this.#onUserInput);
  }

  get root(): HTMLElement {
    return this.#parts.root;
  }

  /** The elements this instance put on the page, attached or not. */
  get elements(): readonly Element[] {
    return [this.#button, this.#host];
  }

  /** Puts the button and, when open, the panel where they belong. Cheap when nothing moved. */
  ensure(parts: ComposerParts): void {
    if (parts.textarea !== this.#parts.textarea) {
      this.#parts.textarea.removeEventListener('input', this.#onUserInput);
      parts.textarea.addEventListener('input', this.#onUserInput);
    }

    this.#parts = parts;

    if (this.#button.previousElementSibling !== parts.anchor) {
      parts.anchor.after(this.#button);
    }

    if (this.#open && this.#host.nextElementSibling !== parts.toolbar) {
      parts.toolbar.before(this.#host);
    }

    if (!this.#open && this.#host.isConnected) {
      this.#host.remove();
    }
  }

  /** Re-renders the panel's provider line after the user changes provider or model. */
  refresh(): void {
    if (this.#open) {
      this.#render();
    }
  }

  destroy(): void {
    this.#destroyed = true;
    this.#stopAnimations();
    this.#parts.textarea.removeEventListener('input', this.#onUserInput);

    if (this.#status.kind === 'busy') {
      this.#parts.textarea.readOnly = false;
    }

    this.#button.remove();
    this.#host.remove();
  }

  readonly #onUserInput = (event: Event): void => {
    if (event.isTrusted && this.#previous !== null) {
      this.#previous = null;

      if (this.#status.kind === 'done') {
        this.#status = { kind: 'idle' };
        this.#render();
      }
    }
  };

  #setOpen(open: boolean): void {
    if (open === this.#open) {
      return;
    }

    this.#open = open;
    this.#button.setAttribute('aria-expanded', String(open));

    if (open) {
      if (this.#status.kind !== 'busy') {
        this.#status = this.#previous === null ? { kind: 'idle' } : { kind: 'done' };
      }

      this.#render();
    }

    this.ensure(this.#parts);
  }

  #render(): void {
    const container = this.#host.shadowRoot?.lastElementChild;

    if (container === null || container === undefined) {
      return;
    }

    const ai = this.#store.value.ai;
    const busy = this.#status.kind === 'busy';
    const options = REWRITE_MODES.map((mode) => {
      const active = this.#status.kind === 'busy' && this.#status.mode === mode;
      const button = el('button', { className: 'option', attrs: { type: 'button', 'data-mode': mode } }, [
        active ? el('span', { className: 'spinner', attrs: { 'aria-hidden': 'true' } }) : null,
        REWRITE_MODE_LABELS[mode],
      ]);

      button.disabled = busy;

      if (active) {
        button.setAttribute('aria-busy', 'true');
      }

      button.addEventListener('click', () => {
        void this.#rewrite(mode);
      });

      return button;
    });

    container.replaceChildren(
      el('div', { className: 'panel', attrs: { role: 'group', 'aria-labelledby': `${this.#panelId}-title` } }, [
        el('div', { className: 'head' }, [
          el('span', { className: 'title', attrs: { id: `${this.#panelId}-title` } }, ['Rewrite with AI']),
          ai === null
            ? null
            : el('span', { className: 'meta' }, [`${PROVIDER_NAMES[ai.provider] ?? ai.provider} · ${ai.model}`]),
        ]),
        el('div', { className: 'options' }, options),
        this.#renderStatus(),
      ]),
    );
  }

  #renderStatus(): HTMLElement {
    const status = this.#status;
    const live = { 'aria-live': 'polite' };

    switch (status.kind) {
      case 'busy':
        return el('p', { className: 'status busy', attrs: live }, [`Rewriting: ${REWRITE_MODE_LABELS[status.mode]}…`]);
      case 'done': {
        const undo = el('button', { className: 'link', attrs: { type: 'button' } }, ['Undo']);

        undo.addEventListener('click', () => {
          this.#undo();
        });

        return el('p', { className: 'status', attrs: live }, ['Rewritten.', undo]);
      }
      case 'error': {
        const settings = SETTINGS_ERRORS.includes(status.error)
          ? el('a', { className: 'link', attrs: { href: SETTINGS_HASH } }, ['Open settings'])
          : null;

        return el('p', { className: 'status error', attrs: { role: 'alert' } }, [
          REWRITE_ERROR_MESSAGES[status.error],
          settings,
        ]);
      }
      case 'idle': {
        const provider = this.#store.value.ai?.provider;

        return el('p', { className: 'status', attrs: live }, [
          `Sends your draft to ${provider === undefined ? 'your provider' : (PROVIDER_NAMES[provider] ?? provider)} and replaces it with the rewrite.`,
        ]);
      }
    }
  }

  async #rewrite(mode: RewriteMode): Promise<void> {
    if (this.#status.kind === 'busy') {
      return;
    }

    const textarea = this.#parts.textarea;
    const draft = textarea.value;

    if (draft.trim() === '') {
      this.#status = { kind: 'error', error: 'empty' };
      this.#render();
      textarea.focus();

      return;
    }

    const wasReadOnly = textarea.readOnly;

    this.#status = { kind: 'busy', mode };
    this.#render();
    // Hold the draft still while it is being rewritten, so nothing typed now is lost when the result lands.
    textarea.readOnly = true;
    this.#startAnimations(textarea);

    let result: RewriteResult;

    try {
      result = await this.#request({ text: draft, mode, maxLength: composerMaxLength(textarea, MAX_DRAFT_LENGTH) });
    } catch {
      result = { ok: false, error: 'provider' };
    }

    this.#stopAnimations();

    if (this.#destroyed) {
      return;
    }

    const current = this.#parts.textarea;

    current.readOnly = wasReadOnly;

    if (!result.ok) {
      this.#status = { kind: 'error', error: result.error };
      this.#render();

      return;
    }

    this.#previous = draft;
    this.#replace(current, result.text);
    this.#status = { kind: 'done' };
    this.#render();
  }

  #undo(): void {
    if (this.#previous === null) {
      return;
    }

    const previous = this.#previous;

    this.#previous = null;
    this.#replace(this.#parts.textarea, previous);
    this.#status = { kind: 'idle' };
    this.#render();
  }

  /** Swaps in new text with a short fade, and leaves the caret at the end, ready to keep typing. */
  #replace(textarea: HTMLTextAreaElement, text: string): void {
    setComposerText(textarea, text);
    textarea.focus();
    textarea.setSelectionRange(text.length, text.length);

    if (!prefersReducedMotion()) {
      textarea.animate(
        [
          { opacity: 0.2, filter: 'blur(2px)' },
          { opacity: 1, filter: 'blur(0)' },
        ],
        { duration: 280, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    }
  }

  /**
   * While the model works, the draft breathes and a soft light sweeps across it, and the button's sparkles pulse.
   * Done with the Web Animations API, which styles the elements without touching any attribute React owns.
   */
  #startAnimations(textarea: HTMLTextAreaElement): void {
    if (prefersReducedMotion()) {
      this.#animations = [
        textarea.animate([{ opacity: 0.6 }, { opacity: 0.6 }], { duration: 1000, iterations: Infinity }),
      ];

      return;
    }

    const sweep =
      'linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--primary) 14%, transparent) 50%, transparent 70%)';

    this.#animations = [
      textarea.animate(
        [
          { opacity: 1, backgroundImage: sweep, backgroundSize: '250% 100%', backgroundPosition: '100% 0' },
          { opacity: 0.55, backgroundImage: sweep, backgroundSize: '250% 100%', backgroundPosition: '0% 0' },
          { opacity: 1, backgroundImage: sweep, backgroundSize: '250% 100%', backgroundPosition: '-100% 0' },
        ],
        { duration: 1600, iterations: Infinity, easing: 'ease-in-out' },
      ),
      this.#icon.animate(
        [
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(1.18) rotate(12deg)' },
          { transform: 'scale(1) rotate(0deg)' },
        ],
        { duration: 900, iterations: Infinity, easing: 'ease-in-out' },
      ),
    ];
  }

  #stopAnimations(): void {
    for (const animation of this.#animations) {
      // Cancelling rejects the animation's `finished` promise. That is expected here, so mark it handled first.
      animation.finished.catch(() => undefined);
      animation.cancel();
    }

    this.#animations = [];
  }
}

export interface ComposerAiOptions {
  store: SettingsStore<ExtensionState>;
  request: RewriteRequester;
}

/**
 * Adds the AI button to every composer on the page while the feature is on and a provider is connected, and removes
 * it everywhere when either stops being true. {@link ComposerAi.ensure} runs on every DOM change.
 */
export class ComposerAi {
  readonly #store: SettingsStore<ExtensionState>;
  readonly #request: RewriteRequester;
  readonly #instances = new Map<HTMLElement, ComposerAiInstance>();

  constructor({ store, request }: ComposerAiOptions) {
    this.#store = store;
    this.#request = request;
  }

  get isActive(): boolean {
    const { settings, ai } = this.#store.value;

    return settings.features.aiRewrite && ai !== null;
  }

  ensure(): void {
    if (!this.isActive) {
      this.destroy();

      return;
    }

    const seen = new Set<HTMLElement>();

    for (const parts of findComposers()) {
      seen.add(parts.root);

      let instance = this.#instances.get(parts.root);

      if (instance === undefined) {
        instance = new ComposerAiInstance(parts, this.#store, this.#request);
        this.#instances.set(parts.root, instance);
      }

      instance.ensure(parts);
    }

    for (const [root, instance] of this.#instances) {
      if (!seen.has(root)) {
        instance.destroy();
        this.#instances.delete(root);
      }
    }

    this.#removeStrays();
  }

  /** Updates open panels, for example after the user picks another model. */
  refresh(): void {
    for (const instance of this.#instances.values()) {
      instance.refresh();
    }
  }

  destroy(): void {
    for (const instance of this.#instances.values()) {
      instance.destroy();
    }

    this.#instances.clear();
    this.#removeStrays();
  }

  /** Removes buttons and panels an earlier copy of the extension left behind. */
  #removeStrays(): void {
    const ours = new Set([...this.#instances.values()].flatMap((instance) => instance.elements));

    for (const element of document.querySelectorAll(
      `${ownedSelector(AI_BUTTON_ROLE)}, ${ownedSelector(AI_PANEL_ROLE)}`,
    )) {
      if (!ours.has(element)) {
        element.remove();
      }
    }
  }
}
