import { OWNED_ATTRIBUTE } from '@/core/constants';
import type { Settings } from '@/core/settings';

import { compileTheme, THEME_ATTRIBUTE } from './compile';
import { CUSTOM_THEME_ID, MAX_THEME_JSON, parseCustomTheme } from './custom';
import { isPresetId, presetById } from './presets';
import type { ThemeDefinition } from './schema';

/**
 * Puts a theme on the page, and takes it off. A theme is one <style> of ours and one attribute on <html>; React renders
 * neither, so they can go on before the page is drawn without touching anything React will hydrate.
 */

/** The theme in use, or `null` for the site's own look. */
export type ThemeChoice = ThemeDefinition | null;

export const THEME_STYLE_ROLE = 'theme';

/**
 * A copy of the choice in the site's localStorage, which, unlike the extension's storage, can be read synchronously
 * before the first paint. It is only ever a hint: it is checked in full before use (a preset's id against the shipped
 * presets, the user's own theme by the validator), and the extension's own storage, read right after, always wins.
 */
export const THEME_CACHE_KEY = 'dnpp-theme';
export const CUSTOM_CACHE_KEY = 'dnpp-theme-custom';

export function choiceFromSettings(settings: Settings): ThemeChoice {
  const { features, theme } = settings;

  if (!features.themes) {
    return null;
  }

  if (theme.preset === CUSTOM_THEME_ID) {
    return theme.custom;
  }

  return presetById(theme.preset);
}

export function readCachedChoice(): ThemeChoice {
  try {
    const id = window.localStorage.getItem(THEME_CACHE_KEY);

    if (isPresetId(id)) {
      return presetById(id);
    }

    if (id === CUSTOM_THEME_ID) {
      const json = window.localStorage.getItem(CUSTOM_CACHE_KEY);

      return json === null || json.length > MAX_THEME_JSON ? null : parseCustomTheme(JSON.parse(json));
    }

    return null;
  } catch {
    // Storage can be blocked, or full, or hold something that is not JSON. The theme then waits for the extension's.
    return null;
  }
}

export function writeCachedChoice(choice: ThemeChoice): void {
  try {
    if (choice === null) {
      window.localStorage.removeItem(THEME_CACHE_KEY);
      window.localStorage.removeItem(CUSTOM_CACHE_KEY);

      return;
    }

    window.localStorage.setItem(THEME_CACHE_KEY, choice.id);

    if (choice.id === CUSTOM_THEME_ID) {
      window.localStorage.setItem(CUSTOM_CACHE_KEY, JSON.stringify(choice));
    } else {
      window.localStorage.removeItem(CUSTOM_CACHE_KEY);
    }
  } catch {
    // Only the next first paint misses out.
  }
}

export class ThemeRuntime {
  #style: HTMLStyleElement | null = null;
  #applied: ThemeChoice = null;
  /** Compiled presets, by id. They never change while the extension runs. */
  readonly #compiled = new Map<string, string>();
  /** The last custom theme compiled, as JSON, and its CSS: an editor sends the same one again and again. */
  #custom: { json: string; css: string } | null = null;

  get applied(): ThemeChoice {
    return this.#applied;
  }

  apply(choice: ThemeChoice): void {
    const root = document.documentElement;

    if (choice === null) {
      root.removeAttribute(THEME_ATTRIBUTE);
      this.#ownStyle()?.remove();
      this.#style = null;
      this.#applied = null;

      return;
    }

    const style = this.#ownStyle() ?? this.#createStyle();
    const css = this.#compile(choice);

    // The rules first, then the attribute they are scoped to, so the page never shows half a theme.
    if (style.textContent !== css) {
      style.textContent = css;
    }

    this.#place(style);
    root.setAttribute(THEME_ATTRIBUTE, choice.id);
    this.#applied = choice;
  }

  /** Once the document has a <head>, moves the style to its end, after the site's own. */
  settle(): void {
    const style = this.#ownStyle();

    if (style !== null) {
      this.#place(style);
    }
  }

  #compile(theme: ThemeDefinition): string {
    if (theme.id !== CUSTOM_THEME_ID) {
      let css = this.#compiled.get(theme.id);

      if (css === undefined) {
        css = compileTheme(theme);
        this.#compiled.set(theme.id, css);
      }

      return css;
    }

    const json = JSON.stringify(theme);

    if (this.#custom?.json !== json) {
      this.#custom = { json, css: compileTheme(theme) };
    }

    return this.#custom.css;
  }

  /** Ours, whether this copy of the extension added it or one before it did (after an update, say). */
  #ownStyle(): HTMLStyleElement | null {
    if (this.#style?.isConnected === true) {
      return this.#style;
    }

    this.#style = document.querySelector<HTMLStyleElement>(`style[${OWNED_ATTRIBUTE}="${THEME_STYLE_ROLE}"]`);

    return this.#style;
  }

  #createStyle(): HTMLStyleElement {
    const style = document.createElement('style');

    style.setAttribute(OWNED_ATTRIBUTE, THEME_STYLE_ROLE);
    this.#style = style;

    return style;
  }

  #place(style: HTMLStyleElement): void {
    // Before the parser reaches <head>, there is only <html> to go in.
    const parent = document.querySelector('head') ?? document.documentElement;

    if (style.parentNode !== parent || style.nextElementSibling !== null) {
      parent.append(style);
    }
  }
}
