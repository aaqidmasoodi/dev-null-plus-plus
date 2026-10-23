import { REPOSITORY } from './constants';

/**
 * What the background last learned about new versions, kept in `browser.storage.local` for the page to read. Only a
 * version number: the link to it is built here, never taken from GitHub's answer.
 */

export const UPDATE_KEY = 'update';
/** The newest version the user closed the notice for, so it stays closed until a newer one is out. */
export const UPDATE_DISMISSED_KEY = 'updateDismissed';

export interface UpdateInfo {
  /** When GitHub was last asked, in ms since the epoch. */
  checkedAt: number;
  /** The latest release's version, like `0.2.0`, or `null` if there is none. */
  latest: string | null;
}

const VERSION = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;

/** `0.2.0` from `0.2.0` or `v0.2.0`; `null` for anything else, so nothing odd from GitHub is ever kept or shown. */
export function parseVersion(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = VERSION.exec(value);

  return match === null ? null : `${String(Number(match[1]))}.${String(Number(match[2]))}.${String(Number(match[3]))}`;
}

/** Whether version `a` is newer than `b`. Both must be plain versions. */
export function isNewer(a: string, b: string): boolean {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    if (difference !== 0) {
      return difference > 0;
    }
  }

  return false;
}

export function parseUpdateInfo(value: unknown): UpdateInfo | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { checkedAt, latest } = value as Record<string, unknown>;

  if (typeof checkedAt !== 'number' || !Number.isFinite(checkedAt)) {
    return null;
  }

  return { checkedAt, latest: latest === null ? null : parseVersion(latest) };
}

/** The release's page on GitHub, where it can be downloaded. */
export function releasePage(version: string): string {
  return `https://github.com/${REPOSITORY}/releases/tag/v${version}`;
}

/** The newer version to tell the user about, if there is one they have not closed the notice for. */
export function availableUpdate(installed: string, info: UpdateInfo | null, dismissed: unknown): string | null {
  const latest = info?.latest ?? null;

  if (latest === null || !isNewer(latest, installed)) {
    return null;
  }

  return parseVersion(dismissed) === latest ? null : latest;
}
