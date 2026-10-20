import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LINGER_AFTER_ACTIVITY_MS, MAX_HOLD_MS, NewCommitHighlights } from '@/features/auto-load/highlight';

const rows = (count: number): HTMLElement[] =>
  Array.from({ length: count }, () => document.body.appendChild(document.createElement('article')));
const move = (x = 4, y = 2): void => {
  window.dispatchEvent(new PointerEvent('pointermove', { movementX: x, movementY: y }));
};

describe('NewCommitHighlights', () => {
  let highlights: NewCommitHighlights;

  beforeEach(() => {
    vi.useFakeTimers();
    highlights = new NewCommitHighlights();
  });

  afterEach(() => {
    highlights.clear();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('tints the new commits', () => {
    const [row] = rows(1);

    highlights.mark(row ? [row] : []);

    expect(highlights.isActive).toBe(true);
    expect(row?.getAnimations().length).toBeGreaterThan(0);
  });

  it('stays while the reader is still, however long', () => {
    highlights.mark(rows(2));
    vi.advanceTimersByTime(60_000);

    expect(highlights.isActive).toBe(true);
  });

  it('fades a few seconds after the reader moves', () => {
    highlights.mark(rows(2));
    vi.advanceTimersByTime(1_000);
    move();

    vi.advanceTimersByTime(LINGER_AFTER_ACTIVITY_MS - 100);
    expect(highlights.isActive).toBe(true);

    vi.advanceTimersByTime(200);
    expect(highlights.isActive).toBe(false);
  });

  it.each([
    ['the wheel', () => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 }))],
    ['a key', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))],
    ['a touch', () => window.dispatchEvent(new Event('touchstart'))],
  ])('counts %s as the reader being there', (_, act) => {
    highlights.mark(rows(1));
    vi.advanceTimersByTime(1_000);
    act();
    vi.advanceTimersByTime(LINGER_AFTER_ACTIVITY_MS + 1);

    expect(highlights.isActive).toBe(false);
  });

  it('ignores the site’s own scroll to the top', () => {
    highlights.mark(rows(1));
    vi.advanceTimersByTime(1_000);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(LINGER_AFTER_ACTIVITY_MS + 1);

    expect(highlights.isActive).toBe(true);
  });

  it('ignores a pointer that did not actually move', () => {
    highlights.mark(rows(1));
    vi.advanceTimersByTime(1_000);
    move(0, 0);
    vi.advanceTimersByTime(LINGER_AFTER_ACTIVITY_MS + 1);

    expect(highlights.isActive).toBe(true);
  });

  it('ignores input in the first moments after loading', () => {
    highlights.mark(rows(1));
    move();
    vi.advanceTimersByTime(LINGER_AFTER_ACTIVITY_MS + 1);

    expect(highlights.isActive).toBe(true);
  });

  it('clears eventually even if the reader never comes back', () => {
    highlights.mark(rows(1));
    vi.advanceTimersByTime(MAX_HOLD_MS + 1);

    expect(highlights.isActive).toBe(false);
  });

  // These two watch a short fade finish, which happy-dom only plays out on the real clock.
  it('lets only the latest arrivals stand out', async () => {
    vi.useRealTimers();

    const [first] = rows(1);
    const [second] = rows(1);

    highlights.mark(first ? [first] : []);
    highlights.mark(second ? [second] : []);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(highlights.isActive).toBe(true);
    expect(first?.getAnimations().length).toBe(0);
    expect(second?.getAnimations().length).toBeGreaterThan(0);
  });

  it('clears straight away when asked', async () => {
    vi.useRealTimers();

    const [row] = rows(1);

    highlights.mark(row ? [row] : []);
    highlights.clear();
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(highlights.isActive).toBe(false);
    expect(row?.getAnimations().length).toBe(0);
  });
});
