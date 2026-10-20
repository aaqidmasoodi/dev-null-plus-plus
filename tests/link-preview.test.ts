// @vitest-environment-options {"url": "https://dev-null.sh/log/latest"}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GROW_DELAY_MS, GROW_MS, HOLD_MS, LinkLongPress } from '@/features/link-preview/long-press';
import { PREVIEW_OPEN_ATTRIBUTE, PreviewDialog } from '@/features/link-preview/preview-dialog';
import { previewableLink, refusesFraming } from '@/site/links';

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

  it('are only https pages, which are the only ones dev-null.sh can show', () => {
    page(
      '<a id="out" href="javascript:alert(1)">x</a><a id="mail" href="mailto:a@b.c">x</a><a id="http" href="http://example.com/">x</a>',
    );

    expect(previewableLink(link())).toBeNull();
    expect(previewableLink(link('mail'))).toBeNull();
    expect(previewableLink(link('http'))).toBeNull();
  });

  it('ignore our own UI and anything outside the site’s app', () => {
    page('<div data-dnpp="x"><a id="out" href="https://example.com/">ours</a></div>');
    document.body.insertAdjacentHTML('beforeend', '<a id="outside" href="https://example.com/">outside</a>');

    expect(previewableLink(link())).toBeNull();
    expect(previewableLink(link('outside'))).toBeNull();
  });

  it('leave out sites that refuse to be shown inside another page', () => {
    page('<a id="out" href="https://github.com/nunomaduro/dev-null.sh">repo</a>');

    expect(previewableLink(link())).toBeNull();
    expect(refusesFraming(new URL('https://gist.github.com/x'))).toBe(true);
    expect(refusesFraming(new URL('https://www.linkedin.com/in/x'))).toBe(true);
    expect(refusesFraming(new URL('https://x.com/nunomaduro'))).toBe(true);
    // Only those sites, not ones that merely end the same way.
    expect(refusesFraming(new URL('https://mygithub.com/'))).toBe(false);
    expect(refusesFraming(new URL('https://someone.github.io/project'))).toBe(false);
    expect(refusesFraming(new URL('https://my-project.dev/'))).toBe(false);
  });
});

describe('press and hold', () => {
  let controller: AbortController;
  let onGrow: ReturnType<typeof vi.fn<(url: URL, origin: { x: number; y: number }, duration: number) => void>>;
  let onCancel: ReturnType<typeof vi.fn<() => void>>;
  let onCommit: ReturnType<typeof vi.fn<() => void>>;
  let enabled: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    page('<a id="out" href="https://example.com/">example</a>');
    controller = new AbortController();
    onGrow = vi.fn();
    onCancel = vi.fn();
    onCommit = vi.fn();
    enabled = true;
    new LinkLongPress({ enabled: () => enabled, onGrow, onCancel, onCommit, signal: controller.signal });
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

  it('leaves a quick click alone', () => {
    pointer('pointerdown', link());
    vi.advanceTimersByTime(GROW_DELAY_MS - 50);
    pointer('pointerup', link());
    vi.advanceTimersByTime(HOLD_MS);

    expect(onGrow).not.toHaveBeenCalled();
    expect(click().defaultPrevented).toBe(false);
  });

  it('grows the preview from the pointer, and keeps it once held long enough', () => {
    pointer('pointerdown', link(), { clientX: 40, clientY: 50 });
    vi.advanceTimersByTime(GROW_DELAY_MS);

    expect(onGrow).toHaveBeenCalledOnce();
    expect(onGrow.mock.calls[0]?.[0].href).toBe('https://example.com/');
    expect(onGrow.mock.calls[0]?.[1]).toEqual({ x: 40, y: 50 });
    expect(onGrow.mock.calls[0]?.[2]).toBe(GROW_MS);
    expect(onCommit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(GROW_MS);
    pointer('pointerup', link());

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    // The click the release ends in does not also open the link, and only that one click.
    expect(click().defaultPrevented).toBe(true);
    expect(click().defaultPrevented).toBe(false);
  });

  it('shrinks back when let go early, and the link does not open either', () => {
    pointer('pointerdown', link());
    vi.advanceTimersByTime(GROW_DELAY_MS + GROW_MS / 2);
    pointer('pointerup', link());
    vi.advanceTimersByTime(HOLD_MS);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
    expect(click().defaultPrevented).toBe(true);
  });

  it('shrinks back when the pointer wanders off while growing', () => {
    pointer('pointerdown', link());
    vi.advanceTimersByTime(GROW_DELAY_MS + 50);
    pointer('pointermove', link(), { clientX: 40 });
    vi.advanceTimersByTime(HOLD_MS);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('is not cancelled by the page being held still under it', () => {
    pointer('pointerdown', link());
    vi.advanceTimersByTime(GROW_DELAY_MS + 50);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(GROW_MS);

    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('gives way to moving, scrolling and modified clicks before it grows', () => {
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

    expect(onGrow).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('tolerates a slightly unsteady hand', () => {
    pointer('pointerdown', link());
    pointer('pointermove', link(), { clientX: 14, clientY: 13 });
    vi.advanceTimersByTime(HOLD_MS);

    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('does nothing when turned off, or once stopped', () => {
    enabled = false;
    pointer('pointerdown', link());
    vi.advanceTimersByTime(HOLD_MS);

    enabled = true;
    pointer('pointerdown', link());
    controller.abort();
    vi.advanceTimersByTime(HOLD_MS);

    expect(onGrow).not.toHaveBeenCalled();
  });
});

describe('the preview', () => {
  let preview: PreviewDialog;

  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    preview = new PreviewDialog();
  });

  afterEach(() => {
    preview.destroy();
    document.body.innerHTML = '';
    vi.useRealTimers();
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

  it('grows without contacting the site, which loads once it settles', () => {
    preview.grow(new URL('https://example.com/'), { x: 0, y: 0 }, GROW_MS);

    expect(preview.isOpen).toBe(true);
    expect(frame()).toBeNull();
    expect(preview.dialog.hasAttribute('data-growing')).toBe(true);
    expect(document.documentElement.hasAttribute(PREVIEW_OPEN_ATTRIBUTE)).toBe(false);

    preview.commit();

    expect(preview.dialog.hasAttribute('data-growing')).toBe(false);
    expect(preview.isOpen).toBe(true);
    expect(frame()?.src).toBe('https://example.com/');
    expect(document.documentElement.hasAttribute(PREVIEW_OPEN_ATTRIBUTE)).toBe(true);
  });

  it('with motion, loads the site only after settling', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    preview.grow(new URL('https://example.com/'), { x: 0, y: 0 }, GROW_MS);
    preview.commit();

    expect(frame()).toBeNull();

    vi.advanceTimersByTime(GROW_MS);

    expect(frame()?.src).toBe('https://example.com/');
  });

  it('shrinks away when the hold is let go early, leaving nothing behind', () => {
    vi.useFakeTimers();
    preview.grow(new URL('https://example.com/'), { x: 0, y: 0 }, GROW_MS);
    preview.cancel();
    vi.advanceTimersByTime(GROW_MS);

    expect(preview.isOpen).toBe(false);
    expect(frame()).toBeNull();
    expect(document.documentElement.hasAttribute(PREVIEW_OPEN_ATTRIBUTE)).toBe(false);

    // A late commit changes nothing.
    preview.commit();
    expect(preview.isOpen).toBe(false);
  });

  it('shows where the page is, and opens it in a new tab without a referrer', () => {
    preview.open(new URL('https://example.com/docs?x=1'), { x: 0, y: 0 });

    expect(preview.dialog.querySelector('.host')?.textContent).toBe('example.com');
    expect(preview.dialog.querySelector('.path')?.textContent).toBe('/docs?x=1');

    const open = preview.dialog.querySelector<HTMLAnchorElement>('a[aria-label="Open in new tab"]');

    expect(open?.href).toBe('https://example.com/docs?x=1');
    expect(open?.rel).toBe('noopener noreferrer');
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

  it('holds the page behind still, and lets it go on close', () => {
    preview.open(new URL('https://example.com/'), { x: 0, y: 0 });

    expect(document.documentElement.hasAttribute(PREVIEW_OPEN_ATTRIBUTE)).toBe(true);

    preview.dialog.querySelector<HTMLButtonElement>('button[aria-label="Close preview"]')?.click();

    expect(preview.isOpen).toBe(false);
    expect(frame()).toBeNull();
    expect(document.documentElement.hasAttribute(PREVIEW_OPEN_ATTRIBUTE)).toBe(false);
  });

  it('closes on Escape', () => {
    preview.open(new URL('https://example.com/'), { x: 0, y: 0 });
    preview.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(preview.isOpen).toBe(false);
  });
});
