import { OWNED_ATTRIBUTE } from '@/core/constants';
import type { Settings } from '@/core/settings';

import { compileTheme, THEME_ATTRIBUTE } from './compile';
import { isPresetId, presetById, type PresetId } from './presets';

/**
 * Puts a theme on the page, and takes it off. A theme is one <style> of ours and one attribute on <html>; React renders
 * neither, so they can go on before the page is drawn without touching anything React will hydrate.
 */

/** The theme in use, or `null` for the site's own look. */
export type ThemeChoice = PresetId | null;

export const THEME_STYLE_ROLE = 'theme';

/**
 * A copy of the choice in the site's localStorage, which, unlike the extension's storage, can be read synchronously
 * before the first paint. It is only ever a hint: it is checked against the shipped themes before use, and the
 * extension's own storage, read right after, always wins.
 */
export const THEME_CACHE_KEY = 'dnpp-theme';

export function choiceFromSettings(settings: Settings): ThemeChoice {
  return settings.features.themes ? settings.theme.preset : null;
}

export function readCachedChoice(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_CACHE_KEY);

    return isPresetId(value) ? value : null;
  } catch {
    // Storage can be blocked, or full. The theme then waits for the extension's storage.
    return null;
  }
}

export function writeCachedChoice(choice: ThemeChoice): void {
  try {
    if (choice === null) {
      window.localStorage.removeItem(THEME_CACHE_KEY);
    } else {
      window.localStorage.setItem(THEME_CACHE_KEY, choice);
    }
  } catch {
    // Only the next first paint misses out.
  }
}

export class ThemeRuntime {
  #style: HTMLStyleElement | null = null;
  #applied: ThemeChoice = null;
  readonly #compiled = new Map<PresetId, string>();

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
    let css = this.#compiled.get(choice);

    if (css === undefined) {
      css = compileTheme(presetById(choice));
      this.#compiled.set(choice, css);
    }

    // The rules first, then the attribute they are scoped to, so the page never shows half a theme.
    if (style.textContent !== css) {
      style.textContent = css;
    }

    this.#place(style);
    root.setAttribute(THEME_ATTRIBUTE, choice);
    this.#applied = choice;
  }

  /** Once the document has a <head>, moves the style to its end, after the site's own. */
  settle(): void {
    const style = this.#ownStyle();

    if (style !== null) {
      this.#place(style);
    }
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
