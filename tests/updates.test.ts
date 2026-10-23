import { describe, expect, it, vi } from 'vitest';

import { CHECK_EVERY_MS, checkForUpdate } from '@/background/updates';
import { isCheckUpdateMessage } from '@/core/messages';
import { availableUpdate, isNewer, parseUpdateInfo, parseVersion, releasePage, type UpdateInfo } from '@/core/updates';

describe('versions', () => {
  it('reads plain versions, with or without a v', () => {
    expect(parseVersion('v0.2.0')).toBe('0.2.0');
    expect(parseVersion('1.10.3')).toBe('1.10.3');
    expect(parseVersion('v01.2.03')).toBe('1.2.3');
  });

  it('keeps nothing else from a tag', () => {
    for (const tag of ['v1.2', '1.2.3-beta', 'v1.2.3"><script>', 'latest', '', 12, null, 'v99999.0.0']) {
      expect(parseVersion(tag)).toBeNull();
    }
  });

  it('compares them part by part, as numbers', () => {
    expect(isNewer('0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.1.9', '0.2.0')).toBe(false);
  });

  it('links to the release on our own repository, whatever GitHub said', () => {
    expect(releasePage('0.2.0')).toBe('https://github.com/aaqidmasoodi/dev-null-plus-plus/releases/tag/v0.2.0');
  });
});

describe('the notice', () => {
  const info = (latest: string | null): UpdateInfo => ({ checkedAt: 1, latest });

  it('shows a newer version', () => {
    expect(availableUpdate('0.1.0', info('0.2.0'), undefined)).toBe('0.2.0');
  });

  it('shows nothing for the same, an older or no version', () => {
    expect(availableUpdate('0.2.0', info('0.2.0'), undefined)).toBeNull();
    expect(availableUpdate('0.3.0', info('0.2.0'), undefined)).toBeNull();
    expect(availableUpdate('0.1.0', info(null), undefined)).toBeNull();
    expect(availableUpdate('0.1.0', null, undefined)).toBeNull();
  });

  it('stays closed for the version it was closed for, and comes back for the next', () => {
    expect(availableUpdate('0.1.0', info('0.2.0'), '0.2.0')).toBeNull();
    expect(availableUpdate('0.1.0', info('0.3.0'), '0.2.0')).toBe('0.3.0');
  });

  it('reads back only what it stored', () => {
    expect(parseUpdateInfo({ checkedAt: 5, latest: '0.2.0' })).toEqual({ checkedAt: 5, latest: '0.2.0' });
    expect(parseUpdateInfo({ checkedAt: 5, latest: 'javascript:alert(1)' })).toEqual({ checkedAt: 5, latest: null });
    expect(parseUpdateInfo({ latest: '0.2.0' })).toBeNull();
    expect(parseUpdateInfo('0.2.0')).toBeNull();
  });
});

describe('the daily check', () => {
  const deps = (stored: UpdateInfo | null, latestRelease: () => Promise<string | null>) => {
    let saved = stored;
    const write = vi.fn((next: UpdateInfo) => {
      saved = next;

      return Promise.resolve();
    });

    return {
      now: () => 10 * CHECK_EVERY_MS,
      latestRelease: vi.fn(latestRelease),
      read: () => Promise.resolve(saved),
      write,
      saved: () => saved,
    };
  };

  it('asks GitHub when it never has, and keeps the answer', async () => {
    const check = deps(null, () => Promise.resolve('0.2.0'));

    await checkForUpdate(check);
    expect(check.latestRelease).toHaveBeenCalledOnce();
    expect(check.saved()).toEqual({ checkedAt: 10 * CHECK_EVERY_MS, latest: '0.2.0' });
  });

  it('asks at most once a day', async () => {
    const check = deps({ checkedAt: 10 * CHECK_EVERY_MS - 1000, latest: '0.1.0' }, () => Promise.resolve('0.2.0'));

    await checkForUpdate(check);
    expect(check.latestRelease).not.toHaveBeenCalled();
  });

  it('shares one request between tabs asking at once', async () => {
    const check = deps(null, () => Promise.resolve('0.2.0'));

    await Promise.all([checkForUpdate(check), checkForUpdate(check), checkForUpdate(check)]);
    expect(check.latestRelease).toHaveBeenCalledOnce();
  });

  it('keeps what it knew when GitHub cannot be reached, and waits a day to try again', async () => {
    const check = deps({ checkedAt: 0, latest: '0.2.0' }, () => Promise.reject(new Error('offline')));

    await checkForUpdate(check);
    expect(check.saved()).toEqual({ checkedAt: 10 * CHECK_EVERY_MS, latest: '0.2.0' });
  });
});

describe('the check message', () => {
  it('is exactly its type', () => {
    expect(isCheckUpdateMessage({ type: 'dnpp:check-update' })).toBe(true);
    expect(isCheckUpdateMessage({ type: 'dnpp:check-update', url: 'https://example.com' })).toBe(false);
    expect(isCheckUpdateMessage({ type: 'dnpp:open-settings' })).toBe(false);
    expect(isCheckUpdateMessage(null)).toBe(false);
  });
});
