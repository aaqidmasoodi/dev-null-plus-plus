import {
  hasContent,
  MAX_DRAFT_LENGTH,
  MAX_INSTRUCTION_LENGTH,
  PRESET_LABELS,
  PRESET_MODES,
  REWRITE_ERROR_MESSAGES,
  UNCHANGED_MESSAGES,
  type PresetMode,
  type RewriteErrorCode,
  type RewriteMode,
  type RewriteResult,
  type UnchangedReason,
} from '@/core/ai';
import { EXTENSION_NAME } from '@/core/constants';
import { createSvgIcon, el, markOwned, ownedSelector } from '@/core/dom';
import { SETTINGS_HASH } from '@/core/route';
import type { SettingsStore } from '@/core/settings';
import { composerMaxLength, findComposers, setComposerText, type ComposerParts } from '@/site/composer';

import styles from './panel.css?inline';
import type { ExtensionState } from './state';
import { SiteTooltip, TOOLTIP_ROLE } from './tooltip';

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

/** The composer button's name, in its tooltip and for screen readers. The panel itself is titled just "Rewrite". */
const BUTTON_LABEL = 'Rewrite with AI';

const IDLE_HINT = 'Rewrites your draft in place. Pick a preset, or say how you want it and press Enter.';

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
  | { kind: 'unchanged'; reason: UnchangedReason }
  | { kind: 'error'; error: RewriteErrorCode };

export interface RewriteRequest {
  text: string;
  mode: RewriteMode;
  instruction: string;
  maxLength: number;
}

export type RewriteRequester = (request: RewriteRequest) => Promise<RewriteResult>;

/**
 * The AI button and panel for one composer. The button toggles the panel, like the site's schedule toggle; the panel
 * opens where the schedule panel opens. Its elements are built once and only their state changes, so what the user
 * types into it survives, and they are put back in place on every {@link ComposerAiInstance.ensure} after React
 * re-renders the toolbar.
 */
class ComposerAiInstance {
  readonly #request: RewriteRequester;
  readonly #button: HTMLButtonElement;
  /** What goes into the toolbar: the button, or a wrapper like the site's own around it. */
  readonly #slot: HTMLElement;
  readonly #icon: SVGSVGElement;
  readonly #tooltip: SiteTooltip;
  readonly #host: HTMLElement;
  readonly #input: HTMLInputElement;
  readonly #presets: Map<PresetMode, HTMLButtonElement>;
  readonly #status: HTMLElement;
  readonly #panelId = `dnpp-ai-panel-${String(++panelCount)}`;
  #parts: ComposerParts;
  #open = false;
  #state: Status = { kind: 'idle' };
  /** The draft before the last rewrite, for Undo. Cleared once the user edits the result. */
  #previous: string | null = null;
  #destroyed = false;
  #animations: Animation[] = [];

  constructor(parts: ComposerParts, request: RewriteRequester) {
    this.#parts = parts;
    this.#request = request;

    const classes = buttonClasses(parts.anchor);

    this.#icon = createSvgIcon(SPARKLES_ICON, classes.icon);
    this.#button = el(
      'button',
      {
        className: classes.button,
        attrs: {
          type: 'button',
          'aria-label': BUTTON_LABEL,
          'aria-expanded': 'false',
          'aria-controls': this.#panelId,
          'data-test': 'dnpp-ai-button',
        },
      },
      [this.#icon],
    );
    this.#button.addEventListener('click', () => {
      this.#setOpen(!this.#open);
    });
    // The site wraps each toolbar button for its tooltip. Ours gets the same wrapper, so the toolbar lays out the same.
    this.#slot =
      parts.slot === parts.anchor ? this.#button : el('span', { className: parts.slot.className }, [this.#button]);
    markOwned(this.#slot, AI_BUTTON_ROLE);
    // The site's own tooltip, not the browser's, shown on the wrapper like theirs.
    this.#tooltip = new SiteTooltip(this.#slot, this.#button, () => BUTTON_LABEL);

    this.#input = el('input', {
      className: 'input',
      attrs: {
        type: 'text',
        'aria-label': 'How should it read?',
        placeholder: 'How should it read? e.g. punchier, add a bit of humour',
        maxlength: String(MAX_INSTRUCTION_LENGTH),
        autocomplete: 'off',
        enterkeyhint: 'go',
      },
    });
    this.#input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();

        const instruction = this.#input.value.trim();

        void this.#rewrite(instruction === '' ? 'improve' : 'custom', instruction);
      }
    });

    this.#presets = new Map(
      PRESET_MODES.map((mode) => {
        const preset = el('button', { className: 'preset', attrs: { type: 'button', 'data-mode': mode } }, [
          PRESET_LABELS[mode],
        ]);

        preset.addEventListener('click', () => {
          void this.#rewrite(mode, '');
        });

        return [mode, preset];
      }),
    );
    this.#status = el('p', { className: 'status', attrs: { 'aria-live': 'polite' } });

    this.#host = el('div', { attrs: { id: this.#panelId } });
    markOwned(this.#host, AI_PANEL_ROLE);

    if (parts.kind === 'reply-composer') {
      this.#host.setAttribute('data-compact', '');
    }

    this.#host
      .attachShadow({ mode: 'open' })
      .append(
        el('style', {}, [styles]),
        el('div', { className: 'panel', attrs: { role: 'group', 'aria-labelledby': `${this.#panelId}-title` } }, [
          el('div', { className: 'head' }, [
            el('span', { className: 'title', attrs: { id: `${this.#panelId}-title` } }, ['Rewrite']),
            el('span', { className: 'brand', attrs: { 'aria-hidden': 'true' } }, [EXTENSION_NAME]),
          ]),
          el('div', { className: 'field' }, [createSvgIcon(SPARKLES_ICON, 'field-icon'), this.#input]),
          el('div', { className: 'presets', attrs: { role: 'group', 'aria-label': 'Presets' } }, [
            ...this.#presets.values(),
          ]),
          this.#status,
        ]),
      );
    this.#renderState();

    this.#host.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.#setOpen(false);
        this.#button.focus();
      }

      // Typing in the panel must not reach the site's single-key shortcuts.
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
    return [this.#slot, this.#host, this.#tooltip.element];
  }

  /** Puts the button and, when open, the panel where they belong. Cheap when nothing moved. */
  ensure(parts: ComposerParts): void {
    if (parts.textarea !== this.#parts.textarea) {
      this.#parts.textarea.removeEventListener('input', this.#onUserInput);
      parts.textarea.addEventListener('input', this.#onUserInput);
    }

    this.#parts = parts;

    if (this.#slot.previousElementSibling !== parts.slot) {
      parts.slot.after(this.#slot);
    }

    if (this.#open && this.#host.nextElementSibling !== parts.toolbar) {
      parts.toolbar.before(this.#host);
    }

    if (!this.#open && this.#host.isConnected) {
      this.#host.remove();
    }
  }

  destroy(): void {
    this.#destroyed = true;
    this.#stopAnimations();
    this.#parts.textarea.removeEventListener('input', this.#onUserInput);

    if (this.#state.kind === 'busy') {
      this.#parts.textarea.readOnly = false;
    }

    this.#tooltip.destroy();
    this.#slot.remove();
    this.#host.remove();
  }

  readonly #onUserInput = (event: Event): void => {
    if (event.isTrusted && this.#previous !== null) {
      this.#previous = null;

      if (this.#state.kind === 'done') {
        this.#setState({ kind: 'idle' });
      }
    }
  };

  #setOpen(open: boolean): void {
    if (open === this.#open) {
      return;
    }

    this.#open = open;
    this.#button.setAttribute('aria-expanded', String(open));

    if (open && this.#state.kind === 'error') {
      this.#setState({ kind: 'idle' });
    }

    this.ensure(this.#parts);

    if (open) {
      this.#input.focus();
    }
  }

  #setState(state: Status): void {
    this.#state = state;
    this.#renderState();
  }

  /** Updates the parts of the panel that depend on its state, leaving the input and its text alone. */
  #renderState(): void {
    const state = this.#state;
    const busy = state.kind === 'busy';

    this.#input.disabled = busy;

    for (const [mode, preset] of this.#presets) {
      const active = busy && state.mode === mode;

      preset.disabled = busy;
      preset.toggleAttribute('aria-busy', active);
      preset.replaceChildren(
        ...(active ? [el('span', { className: 'spinner', attrs: { 'aria-hidden': 'true' } })] : []),
        PRESET_LABELS[mode],
      );
    }

    this.#status.className = 'status';
    this.#status.removeAttribute('role');

    switch (state.kind) {
      case 'idle':
        this.#status.replaceChildren(IDLE_HINT);
        break;
      case 'busy':
        this.#status.classList.add('busy');
        this.#status.replaceChildren('Rewriting…');
        break;
      case 'unchanged':
        this.#status.replaceChildren(UNCHANGED_MESSAGES[state.reason]);
        break;
      case 'done': {
        const undo = el('button', { className: 'link', attrs: { type: 'button' } }, ['Undo']);

        undo.addEventListener('click', () => {
          this.#undo();
        });
        this.#status.replaceChildren('Rewritten.', undo);
        break;
      }
      case 'error': {
        const settings = SETTINGS_ERRORS.includes(state.error)
          ? el('a', { className: 'link', attrs: { href: SETTINGS_HASH } }, ['Open settings'])
          : null;

        this.#status.classList.add('error');
        this.#status.setAttribute('role', 'alert');
        this.#status.replaceChildren(REWRITE_ERROR_MESSAGES[state.error], ...(settings === null ? [] : [settings]));
        break;
      }
    }
  }

  async #rewrite(mode: RewriteMode, instruction: string): Promise<void> {
    if (this.#state.kind === 'busy') {
      return;
    }

    const textarea = this.#parts.textarea;
    const draft = textarea.value;

    if (!hasContent(draft)) {
      this.#setState({ kind: 'error', error: 'empty' });
      textarea.focus();

      return;
    }

    const wasReadOnly = textarea.readOnly;

    this.#setState({ kind: 'busy', mode });
    // Hold the draft still while it is being rewritten, so nothing typed now is lost when the result lands.
    textarea.readOnly = true;
    this.#startAnimations(textarea);

    let result: RewriteResult;

    try {
      result = await this.#request({
        text: draft,
        mode,
        instruction,
        maxLength: composerMaxLength(textarea, MAX_DRAFT_LENGTH),
      });
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
      this.#setState({ kind: 'error', error: result.error });

      return;
    }

    if (!result.changed) {
      // The draft stays exactly as the user left it, and the panel says why in its own words.
      this.#setState({ kind: 'unchanged', reason: result.reason });

      return;
    }

    this.#previous = draft;
    this.#replace(current, result.text);
    this.#setState({ kind: 'done' });
  }

  #undo(): void {
    if (this.#previous === null) {
      return;
    }

    const previous = this.#previous;

    this.#previous = null;
    this.#replace(this.#parts.textarea, previous);
    this.#setState({ kind: 'idle' });
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
        instance = new ComposerAiInstance(parts, this.#request);
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
      `${ownedSelector(AI_BUTTON_ROLE)}, ${ownedSelector(AI_PANEL_ROLE)}, ${ownedSelector(TOOLTIP_ROLE)}`,
    )) {
      if (!ours.has(element)) {
        element.remove();
      }
    }
  }
}
