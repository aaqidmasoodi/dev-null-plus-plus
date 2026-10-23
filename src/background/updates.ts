import { REPOSITORY, UPDATE_ORIGIN } from '@/core/constants';
import { parseUpdateInfo, parseVersion, UPDATE_KEY, type UpdateInfo } from '@/core/updates';

/**
 * Asks GitHub for the latest release, at most once a day however many tabs ask, and keeps its version for the page.
 * Unauthenticated and without credentials, so GitHub sees an address asking for a public page, and nothing else.
 */

export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

export interface UpdateCheckDeps {
  now: () => number;
  /** The latest release's version, `null` if there is none, or throws if GitHub could not be asked. */
  latestRelease: () => Promise<string | null>;
  read: () => Promise<UpdateInfo | null>;
  write: (info: UpdateInfo) => Promise<void>;
}

let running: Promise<void> | null = null;

export function checkForUpdate(deps: UpdateCheckDeps): Promise<void> {
  // Several tabs opening at once share one check.
  running ??= (async () => {
    const previous = await deps.read();

    if (previous !== null && deps.now() - previous.checkedAt < CHECK_EVERY_MS) {
      return;
    }

    let latest: string | null;

    try {
      latest = await deps.latestRelease();
    } catch {
      // Offline, or GitHub is down: keep what we knew, and try again tomorrow rather than on every page.
      latest = previous?.latest ?? null;
    }

    await deps.write({ checkedAt: deps.now(), latest });
  })().finally(() => {
    running = null;
  });

  return running;
}

export async function fetchLatestRelease(): Promise<string | null> {
  const response = await fetch(`${UPDATE_ORIGIN}/repos/${REPOSITORY}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // No release published yet.
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub answered ${String(response.status)}`);
  }

  const body: unknown = await response.json();

  // Only the tag is read, and only kept if it is a plain version number.
  return parseVersion(typeof body === 'object' && body !== null ? (body as { tag_name?: unknown }).tag_name : null);
}

export const storedUpdate = {
  read: async (): Promise<UpdateInfo | null> =>
    parseUpdateInfo((await browser.storage.local.get(UPDATE_KEY))[UPDATE_KEY]),
  write: async (info: UpdateInfo): Promise<void> => {
    await browser.storage.local.set({ [UPDATE_KEY]: info });
  },
};
