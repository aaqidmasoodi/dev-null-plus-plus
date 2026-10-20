import { afterEach, describe, expect, it, vi } from 'vitest';

import { HYDRATION_ATTRIBUTE } from '@/core/constants';
import { waitForHydration } from '@/core/hydration';
import { readRootHydration } from '@/core/react-hydration';

function container({ serverRendered = true }: { serverRendered?: boolean } = {}): HTMLElement {
  const element = document.createElement('div');

  if (serverRendered) {
    element.setAttribute('data-server-rendered', 'true');
  }

  return element;
}

/** Attaches React's root bookkeeping the way `hydrateRoot` does. */
function attachRoot(element: HTMLElement, memoizedState: unknown): void {
  const fiberRoot: { current: unknown } = { current: null };

  fiberRoot.current = { memoizedState };
  Object.assign(element, { __reactContainer$abc123: { stateNode: fiberRoot } });
}

describe('readRootHydration', () => {
  it('is pending until the container exists', () => {
    expect(readRootHydration(null)).toBe('pending');
  });

  it('treats pages that were not server-rendered as client-rendered', () => {
    expect(readRootHydration(container({ serverRendered: false }))).toBe('client-rendered');
  });

  it('is pending until hydrateRoot is called', () => {
    expect(readRootHydration(container())).toBe('pending');
  });

  it('is pending while the root is still dehydrated', () => {
    const element = container();

    attachRoot(element, { isDehydrated: true });

    expect(readRootHydration(element)).toBe('pending');
  });

  it('is hydrated once the commit flips isDehydrated', () => {
    const element = container();

    attachRoot(element, { isDehydrated: false });

    expect(readRootHydration(element)).toBe('hydrated');
  });

  it('reports unknown when React internals change shape', () => {
    const element = container();

    attachRoot(element, 'something else');

    expect(readRootHydration(element)).toBe('unknown');
  });
});

describe('waitForHydration', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(HYDRATION_ATTRIBUTE);
    vi.useRealTimers();
  });

  it('resolves right away when the probe already reported', async () => {
    document.documentElement.setAttribute(HYDRATION_ATTRIBUTE, 'hydrated');

    await expect(waitForHydration(new AbortController().signal, 1_000)).resolves.toBe('hydrated');
  });

  it('resolves when the probe reports later', async () => {
    const result = waitForHydration(new AbortController().signal, 1_000);

    document.documentElement.setAttribute(HYDRATION_ATTRIBUTE, 'client-rendered');

    await expect(result).resolves.toBe('client-rendered');
  });

  it('ignores values it does not recognise', async () => {
    vi.useFakeTimers();
    const result = waitForHydration(new AbortController().signal, 1_000);

    document.documentElement.setAttribute(HYDRATION_ATTRIBUTE, 'bogus');
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toBe('timeout');
  });

  it('times out so the extension still runs if the probe never reports', async () => {
    vi.useFakeTimers();
    const result = waitForHydration(new AbortController().signal, 1_000);

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toBe('timeout');
  });

  it('rejects when the extension is invalidated while waiting', async () => {
    const controller = new AbortController();
    const result = waitForHydration(controller.signal, 1_000);

    controller.abort(new Error('invalidated'));

    await expect(result).rejects.toThrow('invalidated');
  });
});
