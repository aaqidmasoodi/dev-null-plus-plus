import { afterEach, describe, expect, it, vi } from 'vitest';

import { OWNED_ATTRIBUTE } from '@/core/constants';
import { Panel, PANEL_ROLE } from '@/features/panel/panel';

const hosts = (): NodeListOf<Element> => document.querySelectorAll(`[${OWNED_ATTRIBUTE}="${PANEL_ROLE}"]`);

describe('Panel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts one host outside the React root, and replaces any earlier one', () => {
    document.body.innerHTML = '<div id="app"></div>';

    new Panel({ version: '0.1.0' });
    const panel = new Panel({ version: '0.1.0' });

    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]?.parentElement).toBe(document.body);
    expect(document.getElementById('app')?.contains(panel.dialog)).toBe(false);
  });

  it('shows the version', () => {
    const panel = new Panel({ version: '1.2.3' });

    expect(panel.dialog.textContent).toContain('v1.2.3');
  });

  it('opens, closes and toggles, reporting each change', () => {
    const onOpenChange = vi.fn();
    const panel = new Panel({ version: '0.1.0', onOpenChange });

    panel.toggle();
    expect(panel.isOpen).toBe(true);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    panel.toggle();
    expect(panel.isOpen).toBe(false);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('closes from its close button', () => {
    const panel = new Panel({ version: '0.1.0' });

    panel.open();
    panel.dialog.querySelector<HTMLButtonElement>('button.close')?.click();

    expect(panel.isOpen).toBe(false);
  });

  it('keeps key presses from reaching the site shortcuts', () => {
    const panel = new Panel({ version: '0.1.0' });
    const siteShortcut = vi.fn();

    document.addEventListener('keydown', siteShortcut);
    panel.open();
    panel.dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, composed: true }));
    document.removeEventListener('keydown', siteShortcut);

    expect(siteShortcut).not.toHaveBeenCalled();
  });

  it('reattaches its host if the page removed it', () => {
    const panel = new Panel({ version: '0.1.0' });

    hosts()[0]?.remove();
    panel.open();

    expect(hosts()).toHaveLength(1);
    expect(panel.isOpen).toBe(true);
  });

  it('removes itself on destroy', () => {
    const panel = new Panel({ version: '0.1.0' });

    panel.destroy();

    expect(hosts()).toHaveLength(0);
  });
});
