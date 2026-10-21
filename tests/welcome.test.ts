import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { Welcome, WELCOME_STEPS, WELCOMED_KEY } from '@/features/welcome/welcome';

describe('the welcome', () => {
  let controller: AbortController;

  beforeEach(() => {
    fakeBrowser.reset();
    controller = new AbortController();
  });

  afterEach(() => {
    controller.abort();
    document.body.innerHTML = '';
  });

  const start = async (): Promise<Welcome> => {
    const welcome = new Welcome({ onOpenSettings: vi.fn(), signal: controller.signal });

    await welcome.start();

    return welcome;
  };

  it('keeps each step to a title and a line or two', () => {
    expect(WELCOME_STEPS.length).toBeGreaterThan(2);

    for (const step of WELCOME_STEPS) {
      expect(step.title.length).toBeLessThanOrEqual(30);
      expect(step.text.length).toBeLessThanOrEqual(120);
    }
  });

  it('opens the first time, and never by itself once seen', async () => {
    const first = await start();

    expect(first.isOpen).toBe(true);
    first.close();
    await vi.waitFor(async () => {
      expect((await fakeBrowser.storage.local.get(WELCOMED_KEY))[WELCOMED_KEY]).toBe(true);
    });
    controller.abort();
    controller = new AbortController();

    expect((await start()).isOpen).toBe(false);
  });

  it('waits while someone is typing', async () => {
    const field = document.createElement('textarea');

    document.body.append(field);
    field.focus();

    const welcome = await start();

    expect(welcome.isOpen).toBe(false);
    field.blur();
    welcome.showIfPending();
    expect(welcome.isOpen).toBe(true);
  });

  it('closes when it is seen in another tab', async () => {
    const welcome = await start();

    await fakeBrowser.storage.local.set({ [WELCOMED_KEY]: true });

    expect(welcome.isOpen).toBe(false);
  });
});
