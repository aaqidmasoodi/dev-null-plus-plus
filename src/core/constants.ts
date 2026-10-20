export const EXTENSION_NAME = '/dev/null++';

export const SITE_ORIGIN = 'https://dev-null.sh';
export const SITE_HOST_PERMISSION = `${SITE_ORIGIN}/*`;
export const SITE_MATCHES = [SITE_HOST_PERMISSION];

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
