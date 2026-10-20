import { createSvgIcon, el, markOwned, ownedSelector } from '@/core/dom';
import type { ExtensionState } from '@/core/extension-state';
import type { SettingsStore } from '@/core/settings';
import { feedCommits, findNewCommitsPill, isBusyWithFeed, type NewCommitsPill } from '@/site/log';
import { VIEW_ATTRIBUTE } from '@/site/takeover';

import styles from './pill.css?inline';

export const AUTO_LOAD_PILL_ROLE = 'auto-load-pill';
const COVER_STYLE_ROLE = 'auto-load-style';
/** Set on the site's pill wrapper while ours covers it. */
export const COVERED_ATTRIBUTE = 'data-dnpp-covered';

/**
 * How far down the page still counts as "at the top of the log". Loading resets the feed and scrolls to the top, so it
 * only happens on its own when that would not move the reader anywhere.
 */
export const AT_TOP_PX = 200;
/** How long a load may take before we give up and give the site its pill back. */
const LOAD_TIMEOUT_MS = 15_000;
/** Long enough to read "Fetching…", so a fast load does not flash. */
const MIN_FETCHING_MS = 650;

/** Lucide's "arrow-up", the icon on the site's pill. */
const ARROW_UP_ICON = ['m5 12 7-7 7 7', 'M12 19V5'];

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function commits(count: number): string {
  return count === 1 ? '1 new commit' : `${String(count)} new commits`;
}

type State =
  | { kind: 'idle' }
  | { kind: 'waiting'; count: number }
  | { kind: 'fetching'; count: number; before: Set<string>; startedAt: number; timeout: number }
  | { kind: 'settling' };

export interface AutoLoadOptions {
  store: SettingsStore<ExtensionState>;
  signal: AbortSignal;
}

/**
 * Loads new commits on the log as soon as the site's "N new commits" pill appears, instead of waiting for a click.
 *
 * It does not fetch anything itself. It presses the site's own pill, so the site's own code does the loading, exactly
 * as if the user had clicked: the same request, nothing to break if the site changes its API. Around that it adds the
 * motion: our pill covers theirs and turns into "Fetching…", the new commits slide in with a brief highlight, and the
 * pill fades away.
 *
 * The site's load replaces the whole feed with its newest page and scrolls to the top. So it only happens on its own
 * when the reader is already at the top. Further down, nothing moves: our pill reads "N new commits above" and follows
 * them, like the site's, and the commits load the moment they are back at the top, or when they click it.
 *
 * It keeps its hands off entirely while the user writes a reply or a quote, or has a dialog open, while the settings
 * page is showing, and while the tab is in the background. The site's own pill shows as usual then.
 */
export class AutoLoadNewCommits {
  readonly #store: SettingsStore<ExtensionState>;
  readonly #host: HTMLElement;
  readonly #pill: HTMLButtonElement;
  readonly #icon: HTMLElement;
  readonly #label: HTMLElement;
  #state: State = { kind: 'idle' };
  /** The site's pill while ours covers it. */
  #covered: { button: HTMLButtonElement; wrapper: HTMLElement } | null = null;
  #tracking = 0;
  #destroyed = false;

  constructor({ store, signal }: AutoLoadOptions) {
    this.#store = store;
    this.#icon = el('span', { className: 'icon', attrs: { 'aria-hidden': 'true' } });
    this.#label = el('span');
    this.#pill = el('button', { className: 'pill', attrs: { type: 'button' } }, [this.#icon, this.#label]);
    this.#pill.addEventListener('click', () => {
      this.#scrollToTop();
    });
    this.#host = el('div', { attrs: { 'data-test': 'dnpp-auto-load' } });
    markOwned(this.#host, AUTO_LOAD_PILL_ROLE);
    this.#host
      .attachShadow({ mode: 'open' })
      .append(el('style', {}, [styles]), el('div', { attrs: { role: 'status', 'aria-live': 'polite' } }, [this.#pill]));

    for (const stray of document.querySelectorAll(ownedSelector(AUTO_LOAD_PILL_ROLE))) {
      stray.remove();
    }

    document.addEventListener('inertia:finish', this.#onFinish, { signal });
    document.addEventListener('inertia:navigate', this.#onNavigate, { signal });
  }

  get isEnabled(): boolean {
    return this.#store.value.settings.features.autoLoadNewCommits;
  }

  /** What it is doing, for tests. */
  get state(): State['kind'] {
    return this.#state.kind;
  }

  /** Looks at the pill and the page, and loads, waits or stands aside. Runs on every DOM change, scroll and tab switch. */
  ensure(): void {
    if (this.#destroyed || this.#state.kind === 'fetching' || this.#state.kind === 'settling') {
      return;
    }

    const pill = findNewCommitsPill();

    if (pill === null || !this.isEnabled || !this.#mayAct()) {
      // Nothing to do, or not ours to do right now: the site's pill shows as usual.
      if (this.#state.kind === 'waiting') {
        this.#finish();
      }

      return;
    }

    if (window.scrollY <= AT_TOP_PX) {
      this.#fetch(pill);
    } else {
      this.#wait(pill);
    }
  }

  destroy(): void {
    this.#destroyed = true;

    if (this.#state.kind === 'fetching') {
      clearTimeout(this.#state.timeout);
    }

    this.#finish();
    document.head.querySelector(ownedSelector(COVER_STYLE_ROLE))?.remove();
  }

  /** Not on the settings page, not in a background tab, not in the middle of a reply, a quote or a dialog. */
  #mayAct(): boolean {
    return (
      document.visibilityState === 'visible' &&
      !document.documentElement.hasAttribute(VIEW_ATTRIBUTE) &&
      !isBusyWithFeed()
    );
  }

  /** Scrolled down: say what is waiting, and keep following the site's sticky pill. */
  #wait({ button, count }: NewCommitsPill): void {
    const fresh = this.#state.kind !== 'waiting';

    this.#state = { kind: 'waiting', count };
    this.#cover(button);
    this.#icon.replaceChildren(createSvgIcon(ARROW_UP_ICON, ''));
    this.#label.textContent = `${commits(count)} above`;
    this.#pill.disabled = false;
    this.#pill.setAttribute('aria-label', `${commits(count)} above. Scroll to the top to load them.`);

    if (fresh) {
      this.#appear();
    }
  }

  /** At the top: press the site's pill and show "Fetching…" while its router loads them. */
  #fetch({ button, count }: NewCommitsPill): void {
    const fresh = this.#state.kind !== 'waiting';

    this.#state = {
      kind: 'fetching',
      count,
      before: new Set(feedCommits().map((row) => row.dataset.commit ?? '')),
      startedAt: performance.now(),
      timeout: window.setTimeout(() => {
        this.#finish();
      }, LOAD_TIMEOUT_MS),
    };
    this.#cover(button);
    this.#icon.replaceChildren(el('span', { className: 'spinner' }));
    this.#label.textContent = `Fetching ${commits(count)}…`;
    this.#pill.disabled = true;
    this.#pill.removeAttribute('aria-label');

    if (fresh) {
      this.#appear();
    }

    // Exactly what a click does: the site's own handler reloads the feed through its router.
    button.click();
  }

  readonly #onFinish = (): void => {
    if (this.#state.kind !== 'fetching') {
      return;
    }

    const { before, startedAt, timeout } = this.#state;
    const wait = Math.max(0, MIN_FETCHING_MS - (performance.now() - startedAt));

    clearTimeout(timeout);
    this.#state = { kind: 'settling' };
    // The router has finished; give React a frame to render the new commits, then show them off.
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        this.#reveal(before);
      });
    }, wait);
  };

  readonly #onNavigate = (): void => {
    // The site's own reload of the feed fires this too, so only a move off the log counts as leaving. Then whatever we
    // were showing or waiting for belongs to the page that is gone.
    if (this.#state.kind !== 'idle' && !location.pathname.startsWith('/log/')) {
      this.#finish();
    }
  };

  #scrollToTop(): void {
    if (this.#state.kind !== 'waiting') {
      return;
    }

    // Once at the top, the next check loads them.
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  /** The new commits slide in with a brief highlight; our pill says what arrived and fades away. */
  #reveal(before: Set<string>): void {
    if (this.#destroyed) {
      return;
    }

    const rows = feedCommits().filter((row) => !before.has(row.dataset.commit ?? ''));
    const reduced = prefersReducedMotion();

    for (const row of rows) {
      if (reduced) {
        row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
        continue;
      }

      row.animate(
        [
          { opacity: 0, transform: 'translateY(-8px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
      row.animate(
        [
          { backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' },
          { backgroundColor: 'transparent' },
        ],
        { duration: 1800, easing: 'ease-out' },
      );
    }

    this.#icon.replaceChildren(createSvgIcon(ARROW_UP_ICON, ''));
    this.#label.textContent = rows.length === 0 ? 'Up to date' : `${commits(rows.length)} loaded`;

    const fade = this.#pill.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-6px)' },
      ],
      { duration: reduced ? 150 : 320, delay: reduced ? 400 : 900, easing: 'ease-in', fill: 'forwards' },
    );

    fade.finished
      .catch(() => undefined)
      .finally(() => {
        fade.cancel();

        if (this.#state.kind === 'settling') {
          this.#finish();
        }
      });
  }

  /** Back to idle: our pill goes, and the site's shows again if it is still there. */
  #finish(): void {
    if (this.#state.kind === 'fetching') {
      clearTimeout(this.#state.timeout);
    }

    this.#state = { kind: 'idle' };
    this.#stopTracking();
    this.#uncover();
    this.#host.remove();
  }

  #appear(): void {
    this.#ensureCoverStyle();
    document.body.append(this.#host);

    if (this.#covered !== null) {
      this.#place(this.#covered.button);
    }

    if (!prefersReducedMotion()) {
      this.#pill.animate(
        [
          { opacity: 0, transform: 'translateY(-8px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    }
  }

  #place(button: HTMLButtonElement): void {
    const rect = button.getBoundingClientRect();

    if (rect.width === 0) {
      return;
    }

    this.#host.style.transform = `translate(${String(Math.round(rect.left))}px, ${String(Math.round(rect.top))}px)`;
    this.#pill.style.minWidth = `${String(Math.round(rect.width))}px`;
  }

  /** The site's pill is sticky; ours follows it while it exists, then stays where it last was. */
  #track(button: HTMLButtonElement): void {
    this.#stopTracking();

    const step = (): void => {
      if (button.isConnected) {
        this.#place(button);
        this.#tracking = requestAnimationFrame(step);
      }
    };

    this.#tracking = requestAnimationFrame(step);
  }

  #stopTracking(): void {
    cancelAnimationFrame(this.#tracking);
    this.#tracking = 0;
  }

  #cover(button: HTMLButtonElement): void {
    if (this.#covered?.button === button) {
      return;
    }

    this.#uncover();

    const wrapper = button.parentElement ?? button;

    wrapper.setAttribute(COVERED_ATTRIBUTE, '');
    this.#covered = { button, wrapper };
    this.#track(button);
  }

  #uncover(): void {
    this.#covered?.wrapper.removeAttribute(COVERED_ATTRIBUTE);
    this.#covered = null;
  }

  #ensureCoverStyle(): void {
    if (document.head.querySelector(ownedSelector(COVER_STYLE_ROLE)) !== null) {
      return;
    }

    const style = el('style', {}, [`[${COVERED_ATTRIBUTE}] { visibility: hidden !important; }`]);

    markOwned(style, COVER_STYLE_ROLE);
    document.head.append(style);
  }
}
