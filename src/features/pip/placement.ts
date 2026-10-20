import { CORNERS, MAX_LENGTH, MIN_LENGTH, defaultCorner, defaultLength, isCompact } from './geometry';
import type { Corner, Placement, Size } from './geometry';

/**
 * The corner and size the reader chose for the floating player, remembered separately for phones and wide screens,
 * in the extension's own storage, never the page's.
 */
const STORAGE_KEY = 'pipPlacement';

interface Stored {
  compact?: Placement | undefined;
  wide?: Placement | undefined;
}

let stored: Stored = {};

function parsePlacement(value: unknown): Placement | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const { corner, length } = value as Record<string, unknown>;

  return CORNERS.includes(corner as Corner) && typeof length === 'number' && Number.isFinite(length)
    ? { corner: corner as Corner, length: Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, length)) }
    : undefined;
}

/** Loads what was remembered. Until it has, and if it fails, the defaults apply. */
export async function loadPlacements(): Promise<void> {
  try {
    const value = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Record<string, unknown> | undefined;

    stored = { compact: parsePlacement(value?.compact), wide: parsePlacement(value?.wide) };
  } catch {
    stored = {};
  }
}

export function readPlacement(viewport: Size): Placement {
  const remembered = isCompact(viewport) ? stored.compact : stored.wide;

  return remembered ?? { corner: defaultCorner(viewport), length: defaultLength(viewport) };
}

export function writePlacement(placement: Placement, viewport: Size): void {
  stored = { ...stored, [isCompact(viewport) ? 'compact' : 'wide']: placement };
  void browser.storage.local.set({ [STORAGE_KEY]: stored }).catch(() => undefined);
}
