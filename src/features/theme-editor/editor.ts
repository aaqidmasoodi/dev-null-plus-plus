import { createSvgIcon, el, markOwned, ownedSelector } from '@/core/dom';
import type { ExtensionState } from '@/core/extension-state';
import { CLOSE_ICON } from '@/core/icons';
import { createLogger } from '@/core/logger';
import type { Settings, SettingsStore } from '@/core/settings';
import { isHex, type Hex } from '@/themes/color';
import { contrastIssues } from '@/themes/contrast';
import { customFrom, exportTheme, importTheme, KEY_COLOURS, type CustomTheme } from '@/themes/custom';
import { DEFAULT_PRESET, isPresetId, PRESETS, presetById } from '@/themes/presets';
import {
  FONT_IDS,
  PALETTE_COLOURS,
  type FontId,
  type Motifs,
  type Palette,
  type Scheme,
  type Shadow,
} from '@/themes/schema';
import { validateTheme } from '@/themes/validate';

import styles from './editor.css?inline';
import { FONT_LABELS, MOTIF_LABELS, SHADOW_LABELS } from './labels';

const logger = createLogger('theme-editor');

export const EDITOR_ROLE = 'theme-editor';

const TAGLINE = 'Your own theme.';
const DEFAULT_NAME = 'My theme';

/** Every palette colour, named for people. */
const COLOUR_LABELS: Record<(typeof PALETTE_COLOURS)[number], string> = {
  background: 'Page',
  foreground: 'Text',
  card: 'Cards',
  cardForeground: 'Text on cards',
  popover: 'Menus',
  popoverForeground: 'Text in menus',
  primary: 'Accent',
  primaryForeground: 'Text on the accent',
  primaryHover: 'Accent, hovered',
  primarySoft: 'Soft accent',
  secondary: 'Secondary',
  secondaryForeground: 'Text on secondary',
  muted: 'Muted',
  mutedForeground: 'Quiet text',
  accent: 'Hover',
  accentForeground: 'Text on hover',
  destructive: 'Danger',
  destructiveForeground: 'Danger text',
  border: 'Borders',
  input: 'Field borders',
  ring: 'Focus ring',
  rail: 'Graph rail',
  link: 'Links',
  linkVisited: 'Visited links',
  ink: 'Ink: outlines and solid shadows',
  highlight: 'Sparkle',
  edgeLight: 'Bevel, lit edge',
  edgeDark: 'Bevel, shaded edge',
  chromeStart: 'Title bar, left',
  chromeEnd: 'Title bar, right',
  chromeForeground: 'Title bar text',
};

export interface ThemeEditorOptions {
  store: SettingsStore<ExtensionState>;
  saveSettings: (settings: Settings) => Promise<void>;
  /** Shows a draft on this tab only, or `null` to go back to what is saved. */
  preview: (theme: CustomTheme | null) => void;
  /** After it closes, for the brush to come back and take focus. */
  onClose: () => void;
  signal: AbortSignal;
}

/** A shadow, with every field the editor can set, so switching kinds keeps the numbers. */
interface ShadowNumbers {
  x: number;
  y: number;
  blur: number;
  opacity: number;
}

/**
 * The theme editor: a panel down the left of the page that edits the user's own theme, with the page itself as the
 * preview. Nothing is saved until Save; closing without saving puts the saved look back.
 *
 * Built to never leave things worse than it found them:
 * - The draft is a theme like any other and goes through the same validator on every change; the controls cannot
 *   produce anything else, and anything that somehow fails is dropped, not shown.
 * - The draft is only ever shown in this tab, through the theme script ({@link ThemeEditorOptions.preview}), never
 *   written to storage until Save, so a closed tab or a crash leaves the saved theme as it was.
 * - The panel draws itself in the site's own colours, not the draft's, so it stays readable whatever is picked.
 */
export class ThemeEditor {
  readonly #options: ThemeEditorOptions;
  readonly #host: HTMLElement;
  readonly #panel: HTMLElement;
  readonly #heading: HTMLElement;
  readonly #issues: HTMLElement;
  readonly #status: HTMLElement;
  readonly #save: HTMLButtonElement;
  readonly #undo: HTMLButtonElement;
  readonly #footer: HTMLElement;
  readonly #confirm: HTMLElement;
  readonly #importText: HTMLTextAreaElement;
  readonly #importErrors: HTMLElement;
  readonly #syncs: (() => void)[] = [];
  #draft: CustomTheme;
  /** What Undo goes back to: the saved theme, or where this edit started. */
  #base: CustomTheme;
  #open = false;
  #previewFrame = 0;
  /** Whether the page was in dark mode when the editor opened, to put back. */
  #wasDark = false;
  #classes: MutationObserver | null = null;
  #saving = false;
  /** Where focus was when it opened, inside shadow roots too, to go back to when it closes. */
  #returnFocus: HTMLElement | null = null;

  constructor(options: ThemeEditorOptions) {
    this.#options = options;
    this.#draft = this.#starting();
    this.#base = this.#draft;

    for (const stray of document.querySelectorAll(ownedSelector(EDITOR_ROLE))) {
      stray.remove();
    }

    this.#heading = el('h2', { attrs: { id: 'title', tabindex: '-1' } }, ['Theme editor']);

    const close = el(
      'button',
      { className: 'icon', attrs: { type: 'button', 'aria-label': 'Close', title: 'Close' } },
      [createSvgIcon(CLOSE_ICON, '')],
    );

    close.addEventListener('click', () => {
      this.requestClose();
    });

    this.#issues = el('div', { className: 'issues', attrs: { role: 'status' } });
    this.#status = el('span', { className: 'status', attrs: { role: 'status' } });
    this.#save = el('button', { className: 'primary', attrs: { type: 'button' } }, ['Save']);
    this.#undo = el('button', { className: 'secondary', attrs: { type: 'button' } }, ['Undo changes']);
    this.#save.addEventListener('click', () => {
      void this.#saveDraft();
    });
    this.#undo.addEventListener('click', () => {
      this.#update(this.#base);
      this.#say('Back to your saved theme.');
    });

    this.#importText = el('textarea', {
      attrs: { rows: '4', spellcheck: 'false', 'aria-label': 'Theme JSON', placeholder: 'Paste a theme here' },
    });
    this.#importErrors = el('ul', { className: 'errors', attrs: { role: 'alert' } });

    const discard = el('button', { className: 'secondary', attrs: { type: 'button' } }, ['Discard']);
    const keep = el('button', { className: 'primary', attrs: { type: 'button' } }, ['Save']);

    discard.addEventListener('click', () => {
      this.close();
    });
    keep.addEventListener('click', () => {
      void this.#saveDraft().then((saved) => {
        if (saved) {
          this.close();
        }
      });
    });
    this.#confirm = el('div', { className: 'confirm', attrs: { hidden: '' } }, [
      el('p', {}, ['Keep your changes?']),
      el('div', { className: 'buttons' }, [discard, keep]),
    ]);
    this.#footer = el('div', { className: 'footer' }, [
      this.#status,
      el('div', { className: 'buttons' }, [this.#undo, this.#save]),
    ]);

    this.#panel = el(
      'div',
      { className: 'panel', attrs: { role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'title', hidden: '' } },
      [
        el('div', { className: 'header' }, [this.#heading, close]),
        el('div', { className: 'body' }, [
          this.#nameSection(),
          this.#startSection(),
          this.#colourSection(),
          this.#typeSection(),
          this.#shapeSection(),
          this.#motifSection(),
          this.#shareSection(),
        ]),
        this.#footer,
        this.#confirm,
      ],
    );
    this.#panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.requestClose();
      }
    });

    this.#host = el('div');
    markOwned(this.#host, EDITOR_ROLE);
    this.#host.attachShadow({ mode: 'open' }).append(el('style', {}, [styles]), this.#panel);

    // Saved elsewhere (another tab, the settings page) while closed: the next edit starts from that.
    options.store.subscribe(() => {
      if (!this.#open) {
        this.#draft = this.#starting();
        this.#base = this.#draft;
      }
    }, options.signal);
    options.signal.addEventListener(
      'abort',
      () => {
        this.destroy();
      },
      { once: true },
    );
  }

  get isOpen(): boolean {
    return this.#open;
  }

  open(): void {
    if (this.#open) {
      this.#heading.focus();

      return;
    }

    const saved = this.#options.store.value.settings.theme.custom;

    this.#base = saved ?? this.#starting();
    this.#draft = this.#base;
    this.#open = true;
    this.#wasDark = document.documentElement.classList.contains('dark');
    this.#returnFocus = deepActiveElement();

    if (!this.#host.isConnected) {
      document.body.append(this.#host);
    }

    this.#classes = new MutationObserver(() => {
      this.#refresh();
    });
    this.#classes.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    this.#panel.hidden = false;
    this.#showConfirm(false);
    this.#say('');
    this.#refresh();
    // From the first moment, the page shows what is being edited, even while themes are off.
    this.#options.preview(this.#draft);
    this.#heading.focus();
  }

  /** Closes, first asking whether to keep unsaved changes. */
  requestClose(): void {
    if (this.#isDirty()) {
      this.#showConfirm(true);
    } else {
      this.close();
    }
  }

  /** Closes, leaving unsaved changes behind. */
  close(): void {
    if (!this.#open) {
      return;
    }

    this.#open = false;
    cancelAnimationFrame(this.#previewFrame);
    this.#previewFrame = 0;
    this.#classes?.disconnect();
    this.#classes = null;
    document.documentElement.classList.toggle('dark', this.#wasDark);
    this.#panel.hidden = true;
    this.#options.preview(null);
    this.#options.onClose();

    if (this.#returnFocus?.isConnected === true) {
      this.#returnFocus.focus({ preventScroll: true });
    }

    this.#returnFocus = null;
  }

  destroy(): void {
    if (this.#open) {
      this.#open = false;
      cancelAnimationFrame(this.#previewFrame);
      this.#classes?.disconnect();
      document.documentElement.classList.toggle('dark', this.#wasDark);
    }

    this.#host.remove();
  }

  /** The theme to start from with nothing saved: the one in use, or the default. */
  #starting(): CustomTheme {
    const { settings } = this.#options.store.value;
    const saved = settings.theme.custom;

    if (saved !== null) {
      return saved;
    }

    const preset = isPresetId(settings.theme.preset) ? settings.theme.preset : DEFAULT_PRESET;

    return { ...customFrom(presetById(preset), DEFAULT_NAME), tagline: TAGLINE };
  }

  get #scheme(): Scheme {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }

  #palette(): Palette {
    return this.#draft.palettes[this.#scheme];
  }

  #withPalette(palette: Palette): CustomTheme {
    return { ...this.#draft, palettes: { ...this.#draft.palettes, [this.#scheme]: palette } };
  }

  #isDirty(): boolean {
    return JSON.stringify(this.#draft) !== JSON.stringify(this.#base);
  }

  /** Every change comes through here, and is checked in full before it is kept or shown. */
  #update(next: CustomTheme): void {
    const result = validateTheme(next);

    if (!result.ok) {
      logger.warn('Ignored a change that would make an invalid theme.', result.errors);
      this.#refresh();

      return;
    }

    this.#draft = next;
    this.#showConfirm(false);
    this.#say('');
    this.#refresh();
    this.#schedulePreview();
  }

  /** At most one preview a frame, however fast a colour is dragged. */
  #schedulePreview(): void {
    if (this.#previewFrame !== 0) {
      return;
    }

    this.#previewFrame = requestAnimationFrame(() => {
      this.#previewFrame = 0;

      if (this.#open) {
        this.#options.preview(this.#draft);
      }
    });
  }

  async #saveDraft(): Promise<boolean> {
    if (this.#saving) {
      return false;
    }

    this.#saving = true;

    const draft = this.#draft;
    const current = this.#options.store.value.settings;

    try {
      await this.#options.saveSettings({
        ...current,
        features: { ...current.features, themes: true },
        theme: { preset: 'custom', custom: draft },
      });
      this.#base = draft;
      this.#showConfirm(false);
      this.#refresh();
      this.#say('Saved. It is on now, in every tab.');

      return true;
    } catch (error) {
      logger.error('Could not save the theme.', error);
      this.#say('Could not save. Try again.');

      return false;
    } finally {
      this.#saving = false;
    }
  }

  #say(message: string): void {
    this.#status.textContent = message;
  }

  #showConfirm(show: boolean): void {
    this.#confirm.hidden = !show;
    this.#footer.hidden = show;

    if (show) {
      this.#confirm.querySelector('button')?.focus();
    }
  }

  /** Puts every control in step with the draft. The one being typed in is left alone. */
  #refresh(): void {
    this.#host.dataset.scheme = this.#scheme;

    for (const sync of this.#syncs) {
      sync();
    }

    const dirty = this.#isDirty();
    const { settings } = this.#options.store.value;
    const inUse = settings.features.themes && settings.theme.preset === 'custom';

    this.#undo.disabled = !dirty;
    this.#save.disabled = !dirty && inUse;
    this.#renderIssues();
  }

  #renderIssues(): void {
    const issues = contrastIssues(this.#palette());

    if (issues.length === 0) {
      this.#issues.replaceChildren(el('p', { className: 'ok' }, ['All text is easy to read.']));

      return;
    }

    this.#issues.replaceChildren(
      el('p', {}, [`Hard to read in ${this.#scheme} mode:`]),
      el(
        'ul',
        {},
        issues.map(({ label, ratio, minimum }) =>
          el('li', {}, [`${label}: ${ratio.toFixed(1)} to 1, needs ${String(minimum)}`]),
        ),
      ),
    );
  }

  // Controls. Each reads the draft in its sync, and writes through #update.

  #section(title: string, children: Node[], open = true): HTMLElement {
    const details = el('details', {}, [el('summary', {}, [title]), el('div', { className: 'fields' }, children)]);

    details.open = open;

    return details;
  }

  #nameSection(): HTMLElement {
    const input = el('input', { attrs: { type: 'text', maxlength: '40', autocomplete: 'off', id: 'name' } });

    input.addEventListener('input', () => {
      if (input.value.trim() !== '') {
        this.#update({ ...this.#draft, name: input.value });
      }
    });
    input.addEventListener('blur', () => {
      input.value = this.#draft.name;
    });
    this.#syncs.push(() => {
      if (this.#host.shadowRoot?.activeElement !== input) {
        input.value = this.#draft.name;
      }
    });

    return el('div', { className: 'field name' }, [el('label', { attrs: { for: 'name' } }, ['Name']), input]);
  }

  #startSection(): HTMLElement {
    const buttons = PRESETS.map((preset) => {
      const palette = preset.palettes[preset.signature];
      const swatch = el('span', { className: 'swatch', attrs: { 'aria-hidden': 'true' } }, [
        el('span', { className: 'swatch-dot' }),
      ]);

      swatch.style.setProperty('--swatch-page', palette.backdrop[0] ?? palette.background);
      swatch.style.setProperty('--swatch-card', palette.card);
      swatch.style.setProperty('--swatch-accent', palette.primary);

      const button = el('button', { className: 'start', attrs: { type: 'button' } }, [swatch, preset.name]);

      button.addEventListener('click', () => {
        this.#update({ ...customFrom(preset, this.#draft.name), tagline: TAGLINE });
        this.#say(`Started from ${preset.name}. Undo changes goes back.`);
      });

      return button;
    });

    return this.#section('Start from', [
      el('p', { className: 'hint' }, ['Copies a theme’s colours, fonts and shapes, to change from there.']),
      el('div', { className: 'starts' }, buttons),
    ]);
  }

  #colourSection(): HTMLElement {
    const schemes = (['light', 'dark'] as const).map((scheme) => {
      const button = el('button', { attrs: { type: 'button', role: 'radio' } }, [
        scheme === 'light' ? 'Light' : 'Dark',
      ]);

      button.addEventListener('click', () => {
        // The page shows the mode being edited; the site's own setting comes back when the editor closes.
        document.documentElement.classList.toggle('dark', scheme === 'dark');
      });
      this.#syncs.push(() => {
        button.setAttribute('aria-checked', String(this.#scheme === scheme));
      });

      return button;
    });
    const keys = KEY_COLOURS.map(({ id, label, read, write }) =>
      this.#colour(
        `key-${id}`,
        label,
        () => read(this.#palette()),
        (colour) => write(this.#palette(), colour),
      ),
    );
    const all = PALETTE_COLOURS.map((name) =>
      this.#colour(
        `all-${name}`,
        COLOUR_LABELS[name],
        () => this.#palette()[name],
        (colour) => ({ ...this.#palette(), [name]: colour }),
      ),
    );
    const lanes = [0, 1, 2, 3, 4, 5].map((index) =>
      this.#colour(
        `lane-${String(index)}`,
        `Graph lane ${String(index + 1)}`,
        () => this.#palette().lanes[index] ?? '#000000',
        (colour) => {
          const next = [...this.#palette().lanes] as [Hex, Hex, Hex, Hex, Hex, Hex];

          next[index] = colour;

          return { ...this.#palette(), lanes: next };
        },
      ),
    );

    return this.#section('Colours', [
      el('div', { className: 'segmented', attrs: { role: 'radiogroup', 'aria-label': 'Mode to edit' } }, schemes),
      el('p', { className: 'hint' }, [
        'Each theme has a light and a dark side, following the site’s own setting. The page shows the side you edit.',
      ]),
      ...keys,
      this.#backdrop(),
      this.#issues,
      el('details', { className: 'more' }, [el('summary', {}, ['Every colour']), ...all, ...lanes]),
    ]);
  }

  /** A colour, as a picker and as text: `read` gives it, `write` returns the palette with it changed. */
  #colour(id: string, label: string, read: () => Hex, write: (colour: Hex) => Palette): HTMLElement {
    const picker = el('input', { attrs: { type: 'color', id, 'aria-label': label } });
    const text = el('input', {
      className: 'hex',
      attrs: {
        type: 'text',
        maxlength: '7',
        spellcheck: 'false',
        autocomplete: 'off',
        'aria-label': `${label}, as hex`,
      },
    });
    const set = (value: string): void => {
      const colour = value.trim().toLowerCase();

      if (isHex(colour) && colour !== read()) {
        this.#update(this.#withPalette(write(colour)));
      }
    };

    picker.addEventListener('input', () => {
      set(picker.value);
    });
    text.addEventListener('input', () => {
      set(text.value);
    });
    text.addEventListener('blur', () => {
      text.value = read();
    });
    this.#syncs.push(() => {
      const colour = read();

      picker.value = colour;

      if (this.#host.shadowRoot?.activeElement !== text) {
        text.value = colour;
      }
    });

    return el('div', { className: 'colour' }, [el('label', { attrs: { for: id } }, [label]), picker, text]);
  }

  /** The backdrop: one colour, or a gradient of up to four from top to bottom. */
  #backdrop(): HTMLElement {
    const rows = [0, 1, 2, 3].map((index) => {
      const row = this.#colour(
        `backdrop-${String(index)}`,
        index === 0 ? 'Backdrop, top' : `Backdrop, stop ${String(index + 1)}`,
        () => this.#palette().backdrop[index] ?? this.#palette().background,
        (colour) => {
          const next = [...this.#palette().backdrop];

          next[index] = colour;

          return { ...this.#palette(), backdrop: next };
        },
      );

      this.#syncs.push(() => {
        row.hidden = index >= this.#palette().backdrop.length;
      });

      return row;
    });
    const add = el('button', { className: 'secondary small', attrs: { type: 'button' } }, ['Add a stop']);
    const remove = el('button', { className: 'secondary small', attrs: { type: 'button' } }, ['Remove the last']);

    add.addEventListener('click', () => {
      const stops = this.#palette().backdrop;
      const last = stops[stops.length - 1] ?? this.#palette().background;

      this.#update(this.#withPalette({ ...this.#palette(), backdrop: [...stops, last] }));
    });
    remove.addEventListener('click', () => {
      this.#update(this.#withPalette({ ...this.#palette(), backdrop: this.#palette().backdrop.slice(0, -1) }));
    });
    this.#syncs.push(() => {
      add.disabled = this.#palette().backdrop.length >= 4;
      remove.disabled = this.#palette().backdrop.length <= 1;
    });

    return el('div', { className: 'group' }, [...rows, el('div', { className: 'buttons' }, [add, remove])]);
  }

  #select<T extends string>(
    id: string,
    label: string,
    options: Record<T, string>,
    read: () => T,
    write: (value: T) => CustomTheme,
  ): HTMLElement {
    const select = el(
      'select',
      { attrs: { id } },
      (Object.entries(options) as [T, string][]).map(([value, text]) => el('option', { attrs: { value } }, [text])),
    );

    select.addEventListener('change', () => {
      if (Object.hasOwn(options, select.value)) {
        this.#update(write(select.value as T));
      }
    });
    this.#syncs.push(() => {
      select.value = read();
    });

    return el('div', { className: 'field' }, [el('label', { attrs: { for: id } }, [label]), select]);
  }

  #range(
    id: string,
    label: string,
    { min, max, step, unit = '' }: { min: number; max: number; step: number; unit?: string },
    read: () => number,
    write: (value: number) => CustomTheme,
  ): HTMLElement {
    const input = el('input', {
      attrs: { type: 'range', id, min: String(min), max: String(max), step: String(step) },
    });
    const output = el('output', { attrs: { for: id } });

    input.addEventListener('input', () => {
      const value = Number(input.value);

      if (Number.isFinite(value) && value >= min && value <= max) {
        this.#update(write(value));
      }
    });
    this.#syncs.push(() => {
      const value = read();

      input.value = String(value);
      output.textContent = `${String(Math.round(value * 1000) / 1000)}${unit}`;
    });

    return el('div', { className: 'field range' }, [el('label', { attrs: { for: id } }, [label]), input, output]);
  }

  #typeSection(): HTMLElement {
    const fonts = Object.fromEntries(FONT_IDS.map((id) => [id, FONT_LABELS[id]])) as Record<FontId, string>;
    const font = (key: 'sans' | 'mono' | 'display', label: string): HTMLElement =>
      this.#select(
        `font-${key}`,
        label,
        fonts,
        () => this.#draft.type[key],
        (value) => ({ ...this.#draft, type: { ...this.#draft.type, [key]: value } }),
      );

    return this.#section(
      'Type',
      [
        font('sans', 'Text'),
        font('display', 'Headings and names'),
        font('mono', 'Code'),
        this.#range(
          'display-weight',
          'Heading weight',
          { min: 400, max: 900, step: 50 },
          () => this.#draft.type.displayWeight,
          (value) => ({ ...this.#draft, type: { ...this.#draft.type, displayWeight: value } }),
        ),
        this.#range(
          'display-tracking',
          'Heading spacing',
          { min: -0.05, max: 0.1, step: 0.005, unit: 'em' },
          () => this.#draft.type.displayTracking,
          (value) => ({ ...this.#draft, type: { ...this.#draft.type, displayTracking: value } }),
        ),
      ],
      false,
    );
  }

  #shapeSection(): HTMLElement {
    return this.#section(
      'Shape and depth',
      [
        this.#range(
          'radius',
          'Corners',
          { min: 0, max: 28, step: 1, unit: 'px' },
          () => this.#draft.shape.radius,
          (value) => ({ ...this.#draft, shape: { ...this.#draft.shape, radius: value } }),
        ),
        this.#range(
          'border',
          'Borders',
          { min: 1, max: 4, step: 1, unit: 'px' },
          () => this.#draft.shape.border,
          (value) => ({ ...this.#draft, shape: { ...this.#draft.shape, border: value } }),
        ),
        ...this.#shadow('card', 'Card shadow'),
        ...this.#shadow('overlay', 'Menu shadow'),
        this.#range(
          'duration',
          'Animation speed',
          { min: 0, max: 400, step: 10, unit: 'ms' },
          () => this.#draft.motion.duration,
          (value) => ({ ...this.#draft, motion: { duration: value } }),
        ),
      ],
      false,
    );
  }

  /** A shadow's kind, and the numbers for that kind. The numbers of the other kind are kept, to switch back to. */
  #shadow(key: 'card' | 'overlay', label: string): HTMLElement[] {
    const kept: ShadowNumbers = { x: 4, y: 4, blur: 16, opacity: 0.2 };
    const current = (): Shadow => this.#draft.depth[key];
    const numbers = (): ShadowNumbers => {
      const shadow = current();

      if (shadow.kind === 'soft') {
        kept.y = shadow.y;
        kept.blur = shadow.blur;
        kept.opacity = shadow.opacity;
      } else if (shadow.kind === 'hard') {
        kept.x = shadow.x;
        kept.y = shadow.y;
      }

      return kept;
    };
    const build = (kind: Shadow['kind'], changes: Partial<ShadowNumbers> = {}): Shadow => {
      const values = { ...numbers(), ...changes };

      switch (kind) {
        case 'none':
          return { kind };
        case 'soft':
          return {
            kind,
            y: Math.min(values.y, 32),
            blur: values.blur,
            opacity: Math.min(values.opacity, 0.6),
          };
        case 'hard':
          return { kind, x: values.x, y: Math.max(-12, Math.min(values.y, 12)) };
      }
    };
    const set = (shadow: Shadow): CustomTheme => ({ ...this.#draft, depth: { ...this.#draft.depth, [key]: shadow } });
    const kind = this.#select(
      `${key}-kind`,
      label,
      SHADOW_LABELS,
      () => current().kind,
      (value) => set(build(value)),
    );
    const soft = [
      this.#range(
        `${key}-soft-y`,
        'Drop',
        { min: 0, max: 32, step: 1, unit: 'px' },
        () => numbers().y,
        (y) => set(build('soft', { y })),
      ),
      this.#range(
        `${key}-blur`,
        'Blur',
        { min: 0, max: 64, step: 1, unit: 'px' },
        () => numbers().blur,
        (blur) => set(build('soft', { blur })),
      ),
      this.#range(
        `${key}-opacity`,
        'Strength',
        { min: 0, max: 0.6, step: 0.02 },
        () => numbers().opacity,
        (opacity) => set(build('soft', { opacity })),
      ),
    ];
    const hard = [
      this.#range(
        `${key}-hard-x`,
        'Across',
        { min: -12, max: 12, step: 1, unit: 'px' },
        () => numbers().x,
        (x) => set(build('hard', { x })),
      ),
      this.#range(
        `${key}-hard-y`,
        'Down',
        { min: -12, max: 12, step: 1, unit: 'px' },
        () => Math.max(-12, Math.min(numbers().y, 12)),
        (y) => set(build('hard', { y })),
      ),
    ];

    this.#syncs.push(() => {
      for (const row of soft) {
        row.hidden = current().kind !== 'soft';
      }

      for (const row of hard) {
        row.hidden = current().kind !== 'hard';
      }
    });

    return [kind, ...soft.map((row) => indent(row)), ...hard.map((row) => indent(row))];
  }

  #motifSection(): HTMLElement {
    const rows = (Object.keys(MOTIF_LABELS) as (keyof Motifs)[]).map((key) => {
      const { label, options } = MOTIF_LABELS[key];

      return this.#select(
        `motif-${key}`,
        label,
        options as Record<Motifs[typeof key], string>,
        () => this.#draft.motifs[key],
        (value) => ({ ...this.#draft, motifs: { ...this.#draft.motifs, [key]: value } }),
      );
    });

    return this.#section('Style', rows, false);
  }

  #shareSection(): HTMLElement {
    const copy = el('button', { className: 'secondary small', attrs: { type: 'button' } }, ['Copy as JSON']);
    const load = el('button', { className: 'secondary small', attrs: { type: 'button' } }, ['Load']);

    copy.addEventListener('click', () => {
      const json = exportTheme(this.#draft);

      navigator.clipboard.writeText(json).then(
        () => {
          this.#say('Copied. Anyone with /dev/null++ can paste it here.');
        },
        () => {
          // No clipboard: the JSON goes in the box, selected, to copy by hand.
          this.#importText.value = json;
          this.#importText.select();
          this.#say('Copy it from the box below.');
        },
      );
    });
    load.addEventListener('click', () => {
      const result = importTheme(this.#importText.value);

      if (result.ok) {
        this.#importErrors.replaceChildren();
        this.#importText.value = '';
        this.#update(result.theme);
        this.#say(`Loaded ${result.theme.name}. Save to keep it.`);
      } else {
        this.#importErrors.replaceChildren(...result.errors.map((error) => el('li', {}, [error])));
      }
    });

    return this.#section(
      'Share',
      [
        el('p', { className: 'hint' }, ['A theme is plain data: colours, fonts and shapes, nothing that runs.']),
        el('div', { className: 'buttons' }, [copy]),
        this.#importText,
        this.#importErrors,
        el('div', { className: 'buttons' }, [load]),
      ],
      false,
    );
  }
}

function deepActiveElement(): HTMLElement | null {
  let active = document.activeElement;

  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  return active instanceof HTMLElement && active !== document.body ? active : null;
}

function indent(row: HTMLElement): HTMLElement {
  row.classList.add('sub');

  return row;
}
