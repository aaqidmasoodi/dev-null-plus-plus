/**
 * Reads whether React has committed hydration of a server-rendered root. Only works in the page's main world, since
 * React's bookkeeping lives in expando properties that isolated-world content scripts cannot see.
 *
 * This touches React internals, which is why it is kept small and defensive: if the shape is not what we expect it
 * reports `'unknown'` instead of guessing, and the caller treats that as "probably fine, carry on".
 *
 * `hydrateRoot(container)` stores the root's first HostRoot fiber on the container under `__reactContainer$<random>`.
 * That fiber's `stateNode` is the FiberRoot, whose `current` is the committed HostRoot fiber. Its
 * `memoizedState.isDehydrated` starts `true` and flips to `false` in the commit that finishes hydration. This has held
 * from React 18 through 19.
 */
export type RootHydration = 'pending' | 'hydrated' | 'client-rendered' | 'unknown';

const CONTAINER_KEY_PREFIX = '__reactContainer$';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readRootHydration(container: Element | null): RootHydration {
  if (container === null) {
    return 'pending';
  }

  // The site marks server-rendered pages. Without it React renders on the client, and there is nothing to mismatch.
  if (!container.hasAttribute('data-server-rendered')) {
    return 'client-rendered';
  }

  const key = Object.keys(container).find((name) => name.startsWith(CONTAINER_KEY_PREFIX));

  if (key === undefined) {
    // `hydrateRoot` has not been called yet. Inertia resolves the page component before it hydrates.
    return 'pending';
  }

  const hostRoot: unknown = (container as unknown as Record<string, unknown>)[key];
  const fiberRoot = isRecord(hostRoot) ? hostRoot.stateNode : undefined;
  const current = isRecord(fiberRoot) ? fiberRoot.current : undefined;
  const state = isRecord(current) ? current.memoizedState : undefined;

  if (!isRecord(state) || typeof state.isDehydrated !== 'boolean') {
    return 'unknown';
  }

  return state.isDehydrated ? 'pending' : 'hydrated';
}
