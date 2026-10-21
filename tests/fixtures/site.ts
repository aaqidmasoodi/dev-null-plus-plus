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
 * and checked against the live site on 2026-10-20: the textarea, and the toolbar with the image button and, for
 * commits, the schedule toggle.
 *
 * The live site wraps each toolbar button in `<span class="inline-flex shrink-0">` for its tooltip, which the source
 * does not show. `wrapped: false` renders the buttons bare, as the source does, so both shapes stay covered.
 */
export function composersHtml({ wrapped = true }: { wrapped?: boolean } = {}): string {
  const wrap = (button: string): string => (wrapped ? `<span class="inline-flex shrink-0">${button}</span>` : button);

  return `
    <form data-test="commit-composer">
      <div class="grid"><textarea id="body" name="body" maxlength="4500"></textarea></div>
      <div class="mt-2 flex flex-wrap items-center justify-end">
        <div class="flex min-w-0 flex-1 items-center gap-x-1">
          <input type="file" hidden data-test="commit-image-input" />
          ${wrap('<button type="button" class="inline-flex size-9 text-muted-foreground -ml-2" aria-label="Attach images" data-test="attach-images-button"><svg class="lucide lucide-image-plus size-5"></svg></button>')}
          ${wrap('<button type="button" class="inline-flex size-9 text-muted-foreground" aria-label="Add poll" data-test="add-poll-button"><svg class="size-5"></svg></button>')}
          ${wrap('<button type="button" class="inline-flex size-9 text-muted-foreground aria-expanded:bg-primary-soft aria-expanded:text-primary" aria-label="Schedule" aria-expanded="false" data-test="schedule-toggle"><svg class="lucide lucide-clock-3 size-5"></svg></button>')}
          ${wrap('<button type="button" class="inline-flex size-9 text-muted-foreground" aria-label="Preview" data-test="preview-toggle"><svg class="size-5"></svg></button>')}
        </div>
        <button type="submit" data-test="create-commit-button">Commit</button>
      </div>
    </form>
    <form data-test="reply-composer">
      <div class="grid"><textarea id="reply-1" name="body" maxlength="4500"></textarea></div>
      <div class="mt-1.5 flex flex-wrap items-center justify-end">
        <div class="mr-auto flex min-w-0 items-center gap-2">
          <input type="file" hidden data-test="commit-image-input" />
          ${wrap('<button type="button" class="inline-flex size-9 text-muted-foreground size-8" aria-label="Attach images" data-test="attach-images-button"><svg class="lucide lucide-image-plus size-5"></svg></button>')}
        </div>
        <button type="submit" data-test="submit-reply-button">Reply</button>
      </div>
    </form>`;
}

/**
 * A log page, trimmed from resources/js/pages/log/show.tsx as rendered on 2026-10-20: the sticky "N new commits" pill
 * (when `count` is above zero) and the feed of commits, each with a reply nested inside it.
 */
export function logHtml({ count = 0, ids = ['c3', 'c2', 'c1'] }: { count?: number; ids?: string[] } = {}): string {
  const pill =
    count > 0
      ? `<div class="pointer-events-none sticky z-10 flex h-0 items-start justify-center">
          <button type="button" class="pointer-events-auto mt-3 flex items-center gap-1.5 rounded-full bg-primary"><svg class="lucide lucide-arrow-up size-4"></svg>${String(count)} ${count === 1 ? 'new commit' : 'new commits'}</button>
        </div>`
      : '';
  const rows = ids
    .map(
      (id) =>
        `<article data-commit="${id}"><p>Commit ${id}</p><div data-reply data-commit="${id}-reply">A reply</div></article>`,
    )
    .join('');

  return `
    <div id="app">
      <main data-main>
        <div data-nav-content>
          <div class="sticky top-0">Tabs</div>
          ${pill}
          <div class="feed">${rows}</div>
        </div>
      </main>
    </div>`;
}

/**
 * Stands in for the site's pill handler: like `router.reload`, it swaps in the newest page with the new commits on top,
 * drops the pill, and tells everyone the visit finished.
 */
export function respondToPillLikeTheSite(newIds: string[]): () => void {
  const onClick = (event: Event): void => {
    const button = (event.target as Element).closest('button');

    if (button === null || !/new commits?/.test(button.textContent)) {
      return;
    }

    queueMicrotask(() => {
      const feed = document.querySelector('.feed');

      for (const id of [...newIds].reverse()) {
        const row = document.createElement('article');

        row.dataset.commit = id;
        row.textContent = `Commit ${id}`;
        feed?.prepend(row);
      }

      button.parentElement?.remove();
      document.dispatchEvent(new CustomEvent('inertia:navigate'));
      document.dispatchEvent(new CustomEvent('inertia:finish'));
    });
  };

  document.addEventListener('click', onClick);

  return () => {
    document.removeEventListener('click', onClick);
  };
}

/** A made-up person for the "Who to follow" fixtures. Never a real account. */
export interface FixturePerson {
  username: string;
  name: string;
  bio?: string;
  reason?: string;
  lane?: number;
}

export const FIXTURE_PEOPLE: FixturePerson[] = [
  {
    username: 'adapark',
    name: 'Ada Park',
    bio: 'compilers, coffee, and too many side projects',
    reason: 'Followed by 3 you follow',
    lane: 2,
  },
  {
    username: 'tomasreyes',
    name: 'Tomás Reyes',
    bio: 'shipping laravel apps from a boat',
    reason: '128 followers',
    lane: 3,
  },
  { username: 'minjikim', name: 'Minji Kim', reason: '12 followers', lane: 4 },
  { username: 'olu', name: 'Olu Adeyemi', bio: 'rust on weekends', reason: 'Followed by 1 you follow', lane: 1 },
];

/** A made-up avatar address, for a test to answer with a picture it draws itself. */
export const fixtureAvatar = (username: string): string =>
  `https://avatars.githubusercontent.com/u/${String(1000 + username.length)}?v=4&s=80&u=${username}`;

/** One suggested person's row, as the site's SuggestedUserRow renders it in the aside (resources/js/components/who-to-follow.tsx). */
export function suggestedRowHtml(person: FixturePerson): string {
  const details = [
    person.bio === undefined
      ? ''
      : `<span class="block truncate font-mono text-xs text-muted-foreground" title="${person.bio}"><span aria-hidden="true" class="text-muted-foreground/60"># </span>${person.bio}</span>`,
    person.reason === undefined
      ? ''
      : `<span class="block truncate text-xs text-muted-foreground" title="${person.reason}">${person.reason}</span>`,
  ].join('');

  return `<li class="grid grid-cols-1 grid-rows-[1fr]"><div class="min-h-0"><div class="flex items-center gap-3">
    <span class="flex min-w-0 flex-1"><a href="/@${person.username}" class="group flex min-w-0 flex-1 items-center gap-3">
      <span class="inline-flex shrink-0"><span data-slot="avatar" class="relative flex size-9 shrink-0 overflow-hidden rounded-full bg-muted"><img data-slot="avatar-image" class="aspect-square size-full" alt="${person.name}" src="${fixtureAvatar(person.username)}"></span></span>
      <span class="min-w-0"><span class="block truncate text-sm font-semibold group-hover:underline">${person.name}</span><span class="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground"><span aria-hidden="true" class="size-1.5 shrink-0 rounded-full" style="background: var(--lane-${String(person.lane ?? 0)})"></span><span class="truncate">@${person.username}</span></span></span>
    </a></span>
    <div class="flex shrink-0 items-center gap-0.5">
      <button type="button" data-test="suggested-follow-button" aria-label="Follow @${person.username}" class="shrink-0 rounded-md p-1.5"><svg class="size-4"></svg></button>
      <button type="button" data-test="suggested-dismiss-button" aria-label="Not interested. @${person.username} won't be suggested again." class="shrink-0 rounded-md p-1.5"><svg class="size-4"></svg></button>
    </div>
  </div><div class="mt-1.5 min-h-8 pl-12">${details}</div></div></li>`;
}

/** The aside's "Who to follow" block, signed in, with three people shown. */
export function whoToFollowHtml(people: FixturePerson[] = FIXTURE_PEOPLE.slice(0, 3)): string {
  return `<section aria-labelledby="aside-who-to-follow" class="-mt-4 border-t pt-4">
    <div class="mb-3 flex items-center justify-between gap-2"><h2 id="aside-who-to-follow" class="text-sm font-semibold">Who to follow</h2>
      <div class="flex items-center gap-1"><button type="button" data-test="who-to-follow-refresh" aria-label="Suggest other people" title="Suggest other people"><svg></svg></button></div>
    </div>
    <ul class="space-y-4">${people.map(suggestedRowHtml).join('')}</ul>
  </section>`;
}

/**
 * Stands in for the site's handlers: following flips the button's label once the server would have answered,
 * "Not interested" swaps the next spare into the dismissed person's place, and "Suggest other people" puts the next
 * page of people in place of the list. Counts each, as the server would see them.
 */
export function actLikeTheSite(
  spares: FixturePerson[],
  signal: AbortSignal,
  pages: FixturePerson[][] = [],
): { follows: string[]; dismissals: string[]; refreshes: number } {
  const seen = { follows: [] as string[], dismissals: [] as string[], refreshes: 0 };

  document.addEventListener(
    'click',
    (event) => {
      // "Suggest other people": the next page of people, in place of the list.
      if ((event.target as Element).closest('[data-test="who-to-follow-refresh"]') !== null) {
        seen.refreshes++;

        const page = pages.shift();
        const list = document.querySelector('section[aria-labelledby="aside-who-to-follow"] ul');

        if (page !== undefined && list !== null) {
          list.innerHTML = page.map(suggestedRowHtml).join('');
        }

        return;
      }

      const button = (event.target as Element).closest<HTMLElement>('[data-test^="suggested-"]');
      const row = button?.closest('li');

      if (button === null || row === null || row === undefined) {
        return;
      }

      const username = /@([\w-]+)/.exec(button.getAttribute('aria-label') ?? '')?.[1] ?? '';

      if (button.dataset.test === 'suggested-follow-button') {
        seen.follows.push(username);

        const isFollowing = button.getAttribute('aria-label')?.startsWith('Unfollow') === true;

        setTimeout(() => {
          button.setAttribute('aria-label', isFollowing ? `Follow @${username}` : `Unfollow @${username}`);
        }, 50);

        return;
      }

      seen.dismissals.push(username);

      const spare = spares.shift();

      if (spare === undefined) {
        row.remove();
      } else {
        row.outerHTML = suggestedRowHtml(spare);
      }
    },
    { signal },
  );

  return seen;
}

/** The aside's "Who to follow" block while its people load: the site's placeholder rows (SuggestedUsersSkeleton). */
export function whoToFollowLoadingHtml(): string {
  const row = `<li aria-hidden="true"><div class="flex items-center gap-3"><div data-slot="skeleton" class="size-9 shrink-0 rounded-full bg-primary/10 animate-pulse"></div><span class="flex-1"><div data-slot="skeleton" class="my-[3px] h-3.5 w-28 bg-primary/10 animate-pulse"></div></span></div></li>`;

  return `<section aria-labelledby="aside-who-to-follow" class="-mt-4 border-t pt-4">
    <div class="mb-3 flex items-center justify-between gap-2"><h2 id="aside-who-to-follow" class="text-sm font-semibold">Who to follow</h2></div>
    <ul class="space-y-4">${row}${row}${row}</ul>
  </section>`;
}
