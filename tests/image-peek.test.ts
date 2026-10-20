// @vitest-environment-options {"url": "https://dev-null.sh/log/latest"}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { drawnRect, frameAt, intersect, parseObjectPosition, peekRect } from '@/features/image-peek/geometry';
import { GROW_MS, ImagePeek, PEEK_DELAY_MS, RETURN_MS } from '@/features/image-peek/image-peek';
import { peekableImage } from '@/site/images';

const box = { left: 100, top: 200, width: 300, height: 200 };

const firstImage = (): HTMLImageElement => {
  const image = document.querySelector('img');

  if (image === null) {
    throw new Error('The test picture is missing.');
  }

  return image;
};

describe('where a picture is drawn', () => {
  it('fills its box, or keeps its shape inside it or around it', () => {
    const wide = { width: 600, height: 200 };

    expect(drawnRect(box, wide, 'fill')).toEqual(box);
    // Contained: full width, centred vertically.
    expect(drawnRect(box, wide, 'contain')).toEqual({ left: 100, top: 250, width: 300, height: 100 });
    // Covered: full height, overflowing the sides equally.
    expect(drawnRect(box, wide, 'cover')).toEqual({ left: -50, top: 200, width: 600, height: 200 });
  });

  it('follows object-position', () => {
    expect(drawnRect(box, { width: 600, height: 200 }, 'cover', '0% 50%').left).toBe(100);
    expect(parseObjectPosition('10px 100%', { width: 50, height: 40 })).toEqual({ x: 10, y: 40 });
    expect(parseObjectPosition('center', { width: 50, height: 40 })).toEqual({ x: 25, y: 20 });
  });

  it('is cut to what its box shows', () => {
    expect(intersect({ left: -50, top: 200, width: 600, height: 200 }, box)).toEqual(box);
    expect(intersect(box, { left: 1000, top: 0, width: 10, height: 10 })).toBeNull();
  });
});

describe('where a peek ends up', () => {
  const viewport = { width: 1000, height: 800 };

  it('is as big as fits the screen, centred, in the picture’s shape', () => {
    const peek = peekRect(viewport, { width: 4000, height: 2000 }, { width: 300, height: 150 });

    expect(peek.width / peek.height).toBeCloseTo(2);
    expect(peek.width).toBeCloseTo(880);
    expect(peek.left).toBeCloseTo(60);
    expect(peek.top + peek.height / 2).toBeCloseTo(400);
  });

  it('is not blown up past its own size for nothing, but always visibly grows', () => {
    // A 600px picture shown at 300px: it opens at its own size, sharp.
    expect(peekRect(viewport, { width: 600, height: 400 }, { width: 300, height: 200 }).width).toBeCloseTo(600);
    // A small picture shown at its own size still grows clearly.
    expect(peekRect(viewport, { width: 100, height: 100 }, { width: 100, height: 100 }).width).toBeCloseTo(160);
  });
});

describe('the first frame of a peek', () => {
  it('sits exactly on the picture, cut to what the page showed of it', () => {
    const peek = { left: 0, top: 0, width: 1200, height: 400 };
    const drawn = { left: -50, top: 200, width: 600, height: 200 };
    const frame = frameAt(peek, drawn, box, 8);

    expect(frame.transform).toBe('translate(-50px, 200px) scale(0.5, 0.5)');
    // 150px is hidden on each side on the page: 300px in the peek's own, twice as large, coordinates.
    expect(frame.clipPath).toBe('inset(0px 300px 0px 300px round 16px)');
  });
});

describe('peekable images', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const picture = (html: string, natural = 800): HTMLImageElement => {
    document.body.innerHTML = html;

    const image = firstImage();

    Object.defineProperties(image, {
      complete: { value: true },
      naturalWidth: { value: natural },
      naturalHeight: { value: natural },
    });
    image.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 150 });

    return image;
  };

  it('are loaded pictures in the site’s app', () => {
    const image = picture('<div id="app"><a href="/photo"><img src="/a.png"></a></div>');

    expect(peekableImage(image)).toBe(image);
  });

  it('are not ours, outside the app, in a dialog, failed, or icons', () => {
    expect(peekableImage(picture('<div id="app"><div data-dnpp="x"><img src="/a.png"></div></div>'))).toBeNull();
    expect(peekableImage(picture('<img src="/a.png">'))).toBeNull();
    expect(peekableImage(picture('<div id="app"><div role="dialog"><img src="/a.png"></div></div>'))).toBeNull();
    expect(peekableImage(picture('<div id="app"><img src="/favicon.svg" data-fallback></div>'))).toBeNull();
    expect(peekableImage(picture('<div id="app"><img src="/i.png"></div>', 16))).toBeNull();
  });
});

describe('press and hold an image', () => {
  let controller: AbortController;
  let enabled: boolean;
  let peek: ImagePeek;
  let image: HTMLImageElement;

  const pointer = (type: string, init: PointerEventInit = {}): void => {
    image.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        isPrimary: true,
        button: 0,
        pointerId: 1,
        clientX: 50,
        clientY: 50,
        ...init,
      }),
    );
  };
  const click = (): MouseEvent => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    image.dispatchEvent(event);

    return event;
  };
  const overlay = (): Element | null => document.querySelector('[data-dnpp="image-peek"]');

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="app"><a href="/photo"><img src="https://dev-null.sh/a.png" alt="A"></a></div>';
    image = firstImage();
    Object.defineProperties(image, {
      complete: { value: true },
      naturalWidth: { value: 800 },
      naturalHeight: { value: 600 },
    });
    image.getBoundingClientRect = () => DOMRect.fromRect({ x: 10, y: 20, width: 200, height: 150 });
    image.decode = () => Promise.resolve();
    controller = new AbortController();
    enabled = true;
    peek = new ImagePeek({ enabled: () => enabled, signal: controller.signal });
  });

  afterEach(() => {
    controller.abort();
    vi.useRealTimers();
    document.documentElement.querySelectorAll('[data-dnpp]').forEach((node) => {
      node.remove();
    });
    document.body.innerHTML = '';
  });

  it('leaves a quick click alone', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(PEEK_DELAY_MS - 50);
    pointer('pointerup');
    vi.advanceTimersByTime(GROW_MS);

    expect(overlay()).toBeNull();
    expect(click().defaultPrevented).toBe(false);
  });

  it('lifts a copy of the picture out while held, and puts it back when let go', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(PEEK_DELAY_MS);

    expect(peek.isPeeking).toBe(true);
    expect(overlay()?.shadowRoot?.querySelector('img')?.src).toBe('https://dev-null.sh/a.png');

    vi.advanceTimersByTime(GROW_MS + 200);
    pointer('pointerup');
    vi.advanceTimersByTime(RETURN_MS + 200);

    expect(peek.isPeeking).toBe(false);
    expect(overlay()).toBeNull();
    // The click the release ends in does not also open the site's viewer, and only that one.
    expect(click().defaultPrevented).toBe(true);
    expect(click().defaultPrevented).toBe(false);
  });

  it('goes back when let go while still growing', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(PEEK_DELAY_MS + GROW_MS / 3);
    pointer('pointerup');
    vi.advanceTimersByTime(GROW_MS + 200);

    expect(overlay()).toBeNull();
  });

  it('goes back on Escape, or when the window loses focus', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(PEEK_DELAY_MS + GROW_MS);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    vi.advanceTimersByTime(RETURN_MS + 200);

    expect(overlay()).toBeNull();

    pointer('pointerdown');
    vi.advanceTimersByTime(PEEK_DELAY_MS + GROW_MS);
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(RETURN_MS + 200);

    expect(overlay()).toBeNull();
  });

  it('keeps the page still while out', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(PEEK_DELAY_MS);

    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });

    window.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
  });

  it('gives way to moving, scrolling and modified clicks before it starts', () => {
    pointer('pointerdown');
    pointer('pointermove', { clientX: 70 });
    vi.advanceTimersByTime(PEEK_DELAY_MS);

    pointer('pointerdown');
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(PEEK_DELAY_MS);

    pointer('pointerdown', { metaKey: true });
    vi.advanceTimersByTime(PEEK_DELAY_MS);

    expect(overlay()).toBeNull();
  });

  it('does nothing when turned off, and cleans up when stopped', () => {
    enabled = false;
    pointer('pointerdown');
    vi.advanceTimersByTime(PEEK_DELAY_MS);
    expect(overlay()).toBeNull();

    enabled = true;
    pointer('pointerdown');
    vi.advanceTimersByTime(PEEK_DELAY_MS);
    expect(overlay()).not.toBeNull();

    controller.abort();
    expect(overlay()).toBeNull();
  });
});
