/**
 * Where themes attach to dev-null.sh: every selector the theme engine uses, and nothing it does not. Each is a stable
 * hook where the site has one (data-test, data-slot, data-* and ARIA attributes), cross-checked against its source
 * (nunomaduro/dev-null.sh, branch production), and never one of its utility classes.
 *
 * If a hook stops matching after a site update, the rules on it simply do nothing and the theme's colours, type and
 * shapes still apply. The daily live e2e run (e2e/themes.spec.ts) checks every hook here still matches, so we hear
 * about it first.
 */

/** resources/js/layouts/app-layout.tsx */
export const LAYOUT = '[data-nav]';
export const NAV_RAIL = '[data-nav-rail]';
export const NAV_EXPANDED = '[data-nav="expanded"]';
export const MAIN = '[data-main]';
export const ASIDE = 'aside';

/** The main navigation's links, the current one with aria-current (components/app-nav.tsx). */
export const NAV_LINKS = `${NAV_RAIL} nav[aria-label="Main"] > a`;
/** The wordmark at the top of the navigation. */
export const NAV_HEADER = `${NAV_RAIL} header`;

/** A page's title bar, which sticks to the top of the feed. */
export const PAGE_HEADER = `${MAIN} div.sticky:has(> h1)`;
export const PAGE_TITLE = `${MAIN} h1`;

/** A commit and a reply (components/commit-card.tsx, components/commit-thread.tsx). */
export const POST = '[data-test="commit"]';
export const REPLY = '[data-reply]';
export const POST_BODY = '[data-commit-body]';
/**
 * The link to a commit or reply, around its time. Commits mark theirs (data-test="commit-permalink"), replies do not,
 * but both are a link holding a <time>.
 */
export const POST_PERMALINK = 'a:has(> time)';
/** The row with the author and the time, found by the permalink in it. */
export const POST_BYLINE = 'div:has(> a > time)';
/**
 * A commit is a grid: the graph column (avatar and lane) beside the content column, then again beside its replies.
 * The content column is the cell with a permalink and no replies in it. A reply is a row of its avatar and its content
 * column. (Written out rather than built from the hooks above: :has() cannot hold another :has().)
 */
export const POST_CONTENT = `${POST} > div > div:has(a > time):not(:has(${REPLY}))`;
export const REPLY_CONTENT = `${REPLY} > div > div:has(a > time):not(:has(${REPLY}))`;
/** The row of star, quote and reply buttons, found by the star. */
export const POST_ACTIONS = `div:has(> span > [data-test="star-commit-button"], > [data-test="star-commit-button"])`;
export const STAR_BUTTON = '[data-test="star-commit-button"]';

/** Sidebar blocks (components/app-aside.tsx). */
export const ASIDE_SECTION = `${ASIDE} section`;
export const ASIDE_HEADING = `${ASIDE} h2`;
/** Your own card in the sidebar: avatar, name and a list of counts. */
export const ASIDE_PROFILE = `${ASIDE} section:has(> dl)`;
/** A profile page's header (pages/user/show.tsx). */
export const PROFILE_HEADER = `${MAIN} header:has([data-test="profile-live-avatar"])`;

/** Composers (components/commit-composer.tsx). */
export const COMPOSER = '[data-test="commit-composer"]';

/** shadcn/ui building blocks, which carry data-slot (components/ui). */
export const BUTTON = '[data-slot="button"]';
export const AVATAR = '[data-slot="avatar"]';
export const OVERLAYS = [
  '[data-slot="dialog-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="context-menu-content"]',
  '[data-slot="select-content"]',
].join(', ');
export const TOOLTIP = '[data-slot="tooltip-content"]';
export const DIALOG = '[data-slot="dialog-content"]';
export const DIALOG_TITLE = '[data-slot="dialog-title"]';
export const MENU_ITEMS =
  '[data-slot="dropdown-menu-item"], [data-slot="context-menu-item"], [data-slot="select-item"]';

/** Text fields, the site's and any other. */
export const FIELDS = 'input:is([type="text"], [type="search"], [type="url"], [type="email"], :not([type])), textarea';

/** Every hook, by name, for the live check. */
export const HOOKS = {
  LAYOUT,
  NAV_RAIL,
  MAIN,
  ASIDE,
  NAV_LINKS,
  NAV_HEADER,
  PAGE_HEADER,
  PAGE_TITLE,
  POST,
  POST_BODY,
  POST_CONTENT,
  REPLY_CONTENT,
  POST_BYLINE,
  POST_PERMALINK,
  POST_ACTIONS,
  STAR_BUTTON,
  ASIDE_SECTION,
  ASIDE_HEADING,
  ASIDE_PROFILE,
  BUTTON,
  AVATAR,
} as const;
