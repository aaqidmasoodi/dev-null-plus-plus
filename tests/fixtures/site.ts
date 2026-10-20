/**
 * A trimmed copy of dev-null.sh's left rail, as rendered on 2026-10-20 (resources/js/components/app-nav.tsx). Keep
 * this in step with the live markup when the selectors change.
 */
const ITEM_CLASS =
  'relative isolate block h-11 rounded-lg py-3 pr-3 pl-4 text-[15px] leading-5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';
const ACTIVE_ITEM_CLASS = `${ITEM_CLASS} text-primary hover:bg-transparent hover:text-primary`;
const CONTENT_CLASS = 'flex items-center gap-3 [view-transition-class:indicator-label]';
export const LABEL_CLASS =
  'max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] nav-wide:max-w-40 nav-wide:opacity-100 motion-reduce:transition-none';
const BUTTON_CLASS =
  'flex h-11 items-center gap-3 rounded-lg py-3 pr-3 pl-4 text-[15px] leading-5 font-medium text-muted-foreground';

export { ACTIVE_ITEM_CLASS, ITEM_CLASS };

interface NavOptions {
  signedIn?: boolean;
  /** Path of the item marked as the current page. */
  current?: string;
  withSettings?: boolean;
}

function link(title: string, path: string, { signedIn = true, current }: NavOptions): string {
  const href = signedIn ? path : '/auth/github/redirect';
  const isCurrent = signedIn && current === path;

  return `
    <a class="${isCurrent ? ACTIVE_ITEM_CLASS : ITEM_CLASS}" data-slot="tooltip-trigger" href="${href}"${isCurrent ? ' aria-current="page"' : ''}>
      ${isCurrent ? '<span aria-hidden="true" class="absolute inset-0 -z-10 rounded-lg bg-primary-soft"></span>' : ''}
      <span class="${CONTENT_CLASS}" style="view-transition-name: nav-${title.toLowerCase()};">
        <span class="relative"><svg class="lucide lucide-${title.toLowerCase()} size-5" viewBox="0 0 24 24"><path d="M0 0"></path></svg></span>
        <span class="${LABEL_CLASS}">${title}</span>
      </span>
    </a>`;
}

export function navHtml(options: NavOptions = {}): string {
  const { withSettings = true } = options;
  const items: [string, string][] = [
    ['Log', '/log/latest'],
    ['Notifications', '/notifications'],
    ['Remotes', '/remotes'],
    ['Profile', '/@example'],
    ['Starred', '/starred'],
    ...(withSettings ? ([['Settings', '/settings/profile']] as [string, string][]) : []),
  ];

  return `
    <nav aria-label="Main" class="flex min-h-0 flex-1 flex-col gap-1">
      ${items.map(([title, path]) => link(title, path, options)).join('')}
      <button type="button" class="${BUTTON_CLASS} xl:hidden">Search</button>
      <button type="button" class="${BUTTON_CLASS} bg-primary" data-test="nav-commit-button">Commit</button>
      <button type="button" class="${BUTTON_CLASS} hidden lg:flex" data-test="nav-collapse-button">Collapse</button>
    </nav>`;
}

interface SiteOptions extends NavOptions {
  /**
   * `standard` is the three-column layout most pages use. `full-screen` is Remotes': no right column, and the page is
   * fixed to the screen.
   */
  layout?: 'standard' | 'full-screen';
}

/** Renders the app shell with the rail into the test document and returns the nav element. */
export function renderSite(options: SiteOptions = {}): HTMLElement {
  const { layout = 'standard' } = options;

  document.body.innerHTML = `
    <div id="app" data-server-rendered="true">
      <div data-nav="expanded">
        <div data-nav-rail><header>${navHtml(options)}</header></div>
        <main data-main><div data-nav-content></div></main>
        ${layout === 'standard' ? '<aside></aside>' : ''}
      </div>
    </div>`;

  if (layout === 'full-screen') {
    document.documentElement.setAttribute('data-fixed-page', '');
  } else {
    document.documentElement.removeAttribute('data-fixed-page');
  }

  const nav = document.querySelector<HTMLElement>('nav[aria-label="Main"]');

  if (nav === null) {
    throw new Error('Fixture did not render a nav.');
  }

  return nav;
}

/** Swaps the rail for a freshly rendered one, as React does when it remounts the layout. */
export function remountNav(options: NavOptions = {}): HTMLElement {
  const rail = document.querySelector('[data-nav-rail]');

  if (rail === null) {
    throw new Error('No rail to remount.');
  }

  rail.innerHTML = `<header>${navHtml(options)}</header>`;

  const nav = rail.querySelector<HTMLElement>('nav[aria-label="Main"]');

  if (nav === null) {
    throw new Error('Fixture did not render a nav.');
  }

  return nav;
}

/**
 * A commit composer and a reply composer, trimmed from components/commit-composer.tsx and components/commit-thread.tsx
 * as rendered on 2026-10-20: the textarea, and the toolbar with the image button and, for commits, the schedule toggle.
 */
export function composersHtml(): string {
  return `
    <form data-test="commit-composer">
      <div class="grid"><textarea id="body" name="body" maxlength="4500"></textarea></div>
      <div class="mt-2 flex flex-wrap items-center justify-end">
        <div class="flex min-w-0 flex-1 items-center gap-x-1">
          <input type="file" hidden data-test="commit-image-input" />
          <button type="button" class="inline-flex size-9 text-muted-foreground -ml-2" aria-label="Attach images" data-test="attach-images-button"><svg class="lucide lucide-image-plus size-5"></svg></button>
          <button type="button" class="inline-flex size-9 text-muted-foreground" aria-label="Add poll" data-test="add-poll-button"><svg class="size-5"></svg></button>
          <button type="button" class="inline-flex size-9 text-muted-foreground aria-expanded:bg-primary-soft aria-expanded:text-primary" aria-label="Schedule" aria-expanded="false" data-test="schedule-toggle"><svg class="lucide lucide-clock-3 size-5"></svg></button>
        </div>
        <button type="submit" data-test="create-commit-button">Commit</button>
      </div>
    </form>
    <form data-test="reply-composer">
      <div class="grid"><textarea id="reply-1" name="body" maxlength="4500"></textarea></div>
      <div class="mt-1.5 flex flex-wrap items-center justify-end">
        <div class="mr-auto flex min-w-0 items-center gap-2">
          <input type="file" hidden data-test="commit-image-input" />
          <button type="button" class="inline-flex size-9 text-muted-foreground size-8" aria-label="Attach images" data-test="attach-images-button"><svg class="lucide lucide-image-plus size-5"></svg></button>
        </div>
        <button type="submit" data-test="submit-reply-button">Reply</button>
      </div>
    </form>`;
}
