// @vitest-environment-options {"url": "https://dev-null.sh/log/latest"}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HOLD_MS, LinkLongPress } from '@/features/link-preview/long-press';
import { PREVIEW_OPEN_ATTRIBUTE, PreviewDialog } from '@/features/link-preview/preview-dialog';
import { previewableLink } from '@/site/links';

const page = (html: string): void => {
  document.body.innerHTML = `<div id="app">${html}</div>`;
};
const link = (id = 'out'): HTMLAnchorElement => document.getElementById(id) as HTMLAnchorElement;
const pointer = (type: string, target: EventTarget, init: PointerEventInit = {}): void => {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      isPrimary: true,
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      ...init,
    }),
  );
};

describe('previewable links', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('are the site’s links that lead off dev-null.sh', () => {
    page('<a id="out" href="https://example.com/a?b=1"><span id="inner">example</span></a>');

    expect(previewableLink(document.getElementById('inner'))?.url.href).toBe('https://example.com/a?b=1');
  });

  it('leave links to dev-null.sh to the site', () => {
    page('<a id="out" href="https://dev-null.sh/@someone">someone</a><a id="rel" href="/log/latest">log</a>');

    expect(previewableLink(link())).toBeNull();
    expect(previewableLink(link('rel'))).toBeNull();
  });

  it('ignore anything that is not a web page', () => {
    page(
      '<a id="out" href="javascript:alert(1)">x</a><a id="mail" href="mailto:a@b.c">x</a><a id="file" href="file:///etc/passwd">x</a>',
    );

    expect(previewableLink(link())).toBeNull();
    expect(previewableLink(link('mail'))).toBeNull();
    expect(previewableLink(link('file'))).toBeNull();
  });

  it('ignore our own UI and anything outside the site’s app', () => {
    page('<div data-dnpp="x"><a id="out" href="https://example.com/">ours</a></div>');
    document.body.insertAdjacentHTML('beforeend', '<a id="outside" href="https://example.com/">outside</a>');

    expect(previewableLink(link())).toBeNull();
    expect(previewableLink(link('outside'))).toBeNull();
  });
});

describe('press and hold', () => {
  let controller: AbortController;
  let onOpen: ReturnType<typeof vi.fn<(url: URL, origin: { x: number; y: number }) => void>>;
  let enabled: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    page('<a id="out" href="https://example.com/">example</a>');
    controller = new AbortController();
    onOpen = vi.fn();
    enabled = true;
    new LinkLongPress({ enabled: () => enabled, onOpen, signal: controller.signal });
  });

  afterEach(() => {
    controller.abort();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  const click = (): MouseEvent => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    link().dispatchEvent(event);

    return event;
  };

  it('opens a preview once held long enough, and swallows the click that follows', () => {
    pointer('pointerdown', link(), { clientX: 40, clientY: 50 });
    vi.advanceTimersByTime(HOLD_MS);

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen.mock.calls[0]?.[0].href).toBe('https://example.com/');
    expect(onOpen.mock.calls[0]?.[1]).toEqual({ x: 40, y: 50 });

    pointer('pointerup', link());

    expect(click().defaultPrevented).toBe(true);
    // Only that one click.
    expect(click().defaultPrevented).toBe(false);
  });

  it('leaves an ordinary click alone', () => {
    pointer('pointerdown', link());
    vi.advanceTimersByTime(HOLD_MS - 100);
    pointer('pointerup', link());
    vi.advanceTimersByTime(HOLD_MS);

    expect(onOpen).not.toHaveBeenCalled();
    expect(click().defaultPrevented).toBe(false);
  });

  it('gives way to moving, scrolling and modified clicks', () => {
    pointer('pointerdown', link());
    pointer('pointermove', link(), { clientX: 30 });
    vi.advanceTimersByTime(HOLD_MS);

    pointer('pointerdown', link());
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(HOLD_MS);

    pointer('pointerdown', link(), { ctrlKey: true });
    vi.advanceTimersByTime(HOLD_MS);

    pointer('pointerdown', link(), { button: 2 });
    vi.advanceTimersByTime(HOLD_MS);

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('tolerates a slightly unsteady hand', () => {
    pointer('pointerdown', link());
    pointer('pointermove', link(), { clientX: 13, clientY: 12 });
    vi.advanceTimersByTime(HOLD_MS);

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('does nothing when turned off, or once stopped', () => {
    enabled = false;
    pointer('pointerdown', link());
    vi.advanceTimersByTime(HOLD_MS);

    enabled = true;
    pointer('pointerdown', link());
    controller.abort();
    vi.advanceTimersByTime(HOLD_MS);

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows a ring only once a press is clearly not a click', () => {
    const ring = (): Element | null => document.querySelector('[data-dnpp="link-preview-ring"]');

    pointer('pointerdown', link());
    vi.advanceTimersByTime(50);
    expect(ring()).toBeNull();

    vi.advanceTimersByTime(100);
    expect(ring()).not.toBeNull();

    vi.advanceTimersByTime(HOLD_MS);
    expect(ring()).toBeNull();
  });
});

describe('the preview', () => {
  let preview: PreviewDialog;

  beforeEach(() => {
    preview = new PreviewDialog();
  });

  afterEach(() => {
    preview.destroy();
    document.body.innerHTML = '';
  });

  const frame = (): HTMLIFrameElement | null | undefined => preview.dialog.querySelector('iframe');

  it('loads the page like a private window', () => {
    preview.open(new URL('https://example.com/docs?x=1'), { x: 0, y: 0 });

    const iframe = frame();

    expect(preview.isOpen).toBe(true);
    expect(iframe?.src).toBe('https://example.com/docs?x=1');
    expect(iframe?.hasAttribute('credentialless')).toBe(true);
    expect(iframe?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe?.getAttribute('allow')).toBe('');

    const sandbox = iframe?.getAttribute('sandbox')?.split(' ') ?? [];

    expect(sandbox).not.toContain('allow-top-navigation');
    expect(sandbox).not.toContain('allow-top-navigation-by-user-activation');
    expect(sandbox).not.toContain('allow-modals');
    expect(sandbox).not.toContain('allow-downloads');
  });

  it('shows where the page is, and opens it in a new tab without a referrer', () => {
    preview.open(new URL('https://example.com/docs?x=1'), { x: 0, y: 0 });

    expect(preview.dialog.querySelector('.host')?.textContent).toBe('example.com');
    expect(preview.dialog.querySelector('.path')?.textContent).toBe('/docs?x=1');

    const open = preview.dialog.querySelector<HTMLAnchorElement>('a[aria-label="Open in new tab"]');

    expect(open?.href).toBe('https://example.com/docs?x=1');
    expect(open?.rel).toBe('noopener noreferrer');
  });

  it('explains an http page instead of showing a blank frame', () => {
    preview.open(new URL('http://example.com/'), { x: 0, y: 0 });

    expect(frame()).toBeNull();
    expect(preview.dialog.querySelector<HTMLElement>('.notice')?.hidden).toBe(false);
  });

  it('reloads in a fresh frame', () => {
    preview.open(new URL('https://example.com/'), { x: 0, y: 0 });

    const first = frame();

    preview.dialog.querySelector<HTMLButtonElement>('button[aria-label="Reload"]')?.click();

    expect(frame()).not.toBe(first);
    expect(first?.isConnected).toBe(false);
  });

  it('switches between phone, tablet and desktop widths', () => {
    preview.open(new URL('https://example.com/'), { x: 0, y: 0 });

    const viewport = preview.dialog.querySelector<HTMLElement>('.viewport');
    const sizeButton = (label: string): HTMLButtonElement | undefined =>
      [...preview.dialog.querySelectorAll<HTMLButtonElement>('.sizes button')].find((b) => b.textContent === label);

    sizeButton('Phone')?.click();
    expect(viewport?.style.width).toBe('390px');
    expect(sizeButton('Phone')?.getAttribute('aria-pressed')).toBe('true');

    sizeButton('Desktop')?.click();
    expect(viewport?.style.width).toBe('');
  });

  it('holds the page behind still, and lets it go on close', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    preview.open(new URL('https://example.com/'), { x: 0, y: 0 });

    expect(document.documentElement.hasAttribute(PREVIEW_OPEN_ATTRIBUTE)).toBe(true);

    preview.dialog.querySelector<HTMLButtonElement>('button[aria-label="Close preview"]')?.click();
    await Promise.resolve();

    expect(preview.isOpen).toBe(false);
    expect(frame()).toBeNull();
    expect(document.documentElement.hasAttribute(PREVIEW_OPEN_ATTRIBUTE)).toBe(false);
    vi.restoreAllMocks();
  });

  it('closes on Escape', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    preview.open(new URL('https://example.com/'), { x: 0, y: 0 });
    preview.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(preview.isOpen).toBe(false);
    vi.restoreAllMocks();
  });
});
