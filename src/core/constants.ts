export const EXTENSION_NAME = '/dev/null++';

export const SITE_ORIGIN = 'https://dev-null.sh';
export const SITE_HOST_PERMISSION = `${SITE_ORIGIN}/*`;
export const SITE_MATCHES = [SITE_HOST_PERMISSION];

/**
 * The AI providers' API origins, the only places the extension ever connects to. Must match `PROVIDERS` in
 * `src/background/providers.ts`; a unit test keeps them in step.
 */
export const AI_PROVIDER_ORIGINS = [
  'https://api.groq.com',
  'https://api.openai.com',
  'https://api.anthropic.com',
  'https://api.x.ai',
  'https://generativelanguage.googleapis.com',
] as const;

/**
 * Providers whose APIs do not answer CORS for extensions, so the user grants access to them when they choose one.
 * Optional, never requested at install.
 */
export const OPTIONAL_HOST_PERMISSIONS = ['https://api.groq.com/*'];

/**
 * Where releases are published. The background asks GitHub's API for the latest one, at most once a day, while update
 * notices are on (settings, Updates). The only place the extension connects to besides the AI providers.
 */
export const REPOSITORY = 'aaqidmasoodi/dev-null-plus-plus';
export const UPDATE_ORIGIN = 'https://api.github.com';

/** The extension page that holds the key-entry form, framed into the settings page. */
export const VAULT_PAGE = 'vault.html';

/**
 * Content Security Policy for the extension's own pages and its service worker. Deny everything, then allow only our
 * own bundled scripts, styles and images. Network access is limited to the AI providers' API origins and GitHub's API,
 * for update notices, and nothing else. Only dev-null.sh may frame our pages, and only the key-entry page is exposed to it at all. Trusted Types make
 * any HTML-string sink throw.
 */
export function extensionPagesCsp({ devServer }: { devServer?: string } = {}): string {
  // `npm run dev` reloads the extension over a websocket to the local dev server. Production builds allow nothing more.
  const dev = devServer === undefined ? [] : [devServer, devServer.replace(/^http/, 'ws')];

  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src ${[...AI_PROVIDER_ORIGINS, UPDATE_ORIGIN, ...dev].join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${SITE_ORIGIN}`,
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join('; ');
}

export const EXTENSION_PAGES_CSP = extensionPagesCsp();

/** The local server `npm run dev` serves from. WXT picks the port, so dev builds allow any port on localhost. */
export const DEV_SERVER = 'http://localhost:*';

/** Whether `url` is on dev-null.sh, compared by exact origin. Anything unparsable is not. */
export function isSiteUrl(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }

  try {
    return new URL(url).origin === SITE_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * Content scripts only ever act on dev-null.sh itself, in the top frame. The manifest already limits where they run;
 * this check backs it up, so a broadened match pattern or a dev-null.sh page framed by another site never gets the
 * extension's UI.
 */
export function isTopLevelSitePage(): boolean {
  return window.top === window && location.origin === SITE_ORIGIN;
}

/**
 * Every element the extension adds to the page carries this attribute, so it can find, dedupe and remove its own nodes
 * without touching the site's.
 */
export const OWNED_ATTRIBUTE = 'data-dnpp';

/**
 * Set on `<html>` by the main-world probe once React has finished hydrating the server-rendered page. See
 * `entrypoints/hydration-probe.content.ts`.
 */
export const HYDRATION_ATTRIBUTE = 'data-dnpp-hydration';

export type HydrationState = 'hydrated' | 'client-rendered' | 'unknown' | 'timeout';

/** How long the probe watches for hydration before giving up and letting the extension go ahead anyway. */
export const HYDRATION_PROBE_TIMEOUT_MS = 20_000;

/** How long the content script waits for the probe, a little longer than the probe itself so it normally hears back. */
export const HYDRATION_WAIT_TIMEOUT_MS = HYDRATION_PROBE_TIMEOUT_MS + 5_000;
