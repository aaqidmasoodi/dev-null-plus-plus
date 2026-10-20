import { describe, expect, it } from 'vitest';

import { isSiteUrl } from '@/core/constants';
import { redact, redactValue } from '@/core/logger';
import { isContentMessage, isFromOwnBackground, isFromSiteContentScript, type Sender } from '@/core/messages';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

describe('isSiteUrl', () => {
  it('accepts dev-null.sh only, by exact origin', () => {
    expect(isSiteUrl('https://dev-null.sh/log/latest#dev-null-plus-plus')).toBe(true);
    expect(isSiteUrl('http://dev-null.sh/')).toBe(false);
    expect(isSiteUrl('https://dev-null.sh.evil.com/')).toBe(false);
    expect(isSiteUrl('https://evil.com/?https://dev-null.sh')).toBe(false);
    expect(isSiteUrl('https://sub.dev-null.sh/')).toBe(false);
    expect(isSiteUrl('https://dev-null.sh:8443/')).toBe(false);
  });

  it('rejects anything unparsable or missing', () => {
    expect(isSiteUrl(undefined)).toBe(false);
    expect(isSiteUrl('')).toBe(false);
    expect(isSiteUrl('not a url')).toBe(false);
  });
});

describe('isContentMessage', () => {
  it('accepts exactly the known shape', () => {
    expect(isContentMessage({ type: 'dnpp:open-settings' })).toBe(true);
  });

  it('rejects unknown types, extra fields and non-objects', () => {
    expect(isContentMessage({ type: 'dnpp:other' })).toBe(false);
    expect(isContentMessage({ type: 'dnpp:open-settings', url: 'https://evil.com' })).toBe(false);
    expect(isContentMessage('dnpp:open-settings')).toBe(false);
    expect(isContentMessage(null)).toBe(false);
  });
});

describe('isFromOwnBackground', () => {
  it('accepts this extension’s background', () => {
    expect(isFromOwnBackground({ id: EXTENSION_ID }, EXTENSION_ID)).toBe(true);
  });

  it('rejects other extensions and anything sent from a tab', () => {
    expect(isFromOwnBackground({ id: 'another-extension' }, EXTENSION_ID)).toBe(false);
    expect(isFromOwnBackground({ id: EXTENSION_ID, tab: { id: 1 } }, EXTENSION_ID)).toBe(false);
    expect(isFromOwnBackground({}, EXTENSION_ID)).toBe(false);
  });
});

describe('isFromSiteContentScript', () => {
  const trusted: Sender = {
    id: EXTENSION_ID,
    tab: { id: 7, url: 'https://dev-null.sh/log/latest' },
    frameId: 0,
    origin: 'https://dev-null.sh',
    url: 'https://dev-null.sh/log/latest',
  };

  it('accepts our content script in the top frame of a dev-null.sh tab', () => {
    expect(isFromSiteContentScript(trusted, EXTENSION_ID)).toBe(true);
  });

  it('accepts Firefox’s shape, which has a url but no origin', () => {
    expect(isFromSiteContentScript({ ...trusted, origin: undefined }, EXTENSION_ID)).toBe(true);
  });

  it('rejects another extension', () => {
    expect(isFromSiteContentScript({ ...trusted, id: 'another-extension' }, EXTENSION_ID)).toBe(false);
  });

  it('rejects subframes, including dev-null.sh framed by another site', () => {
    expect(isFromSiteContentScript({ ...trusted, frameId: 3 }, EXTENSION_ID)).toBe(false);
    expect(
      isFromSiteContentScript({ ...trusted, frameId: 3, tab: { id: 7, url: 'https://evil.com/' } }, EXTENSION_ID),
    ).toBe(false);
  });

  it('rejects other origins and senders without a tab', () => {
    expect(isFromSiteContentScript({ ...trusted, origin: 'https://evil.com' }, EXTENSION_ID)).toBe(false);
    expect(isFromSiteContentScript({ ...trusted, tab: { id: 7, url: 'https://evil.com/' } }, EXTENSION_ID)).toBe(false);
    expect(isFromSiteContentScript({ ...trusted, tab: undefined }, EXTENSION_ID)).toBe(false);
  });
});

describe('log redaction', () => {
  // Built at runtime so the fake keys do not trip secret scanners.
  const fakeKey = (prefix: string): string => `${prefix}${'a1B2c3D4'.repeat(5)}`;

  it('redacts provider API keys and bearer tokens', () => {
    for (const prefix of ['sk-', 'sk-proj-', 'sk-ant-', 'xai-', 'gsk_']) {
      expect(redact(`key is ${fakeKey(prefix)} ok`)).toBe('key is [redacted] ok');
    }

    expect(redact(`Authorization: Bearer ${fakeKey('')}`)).toBe('Authorization: [redacted]');
  });

  it('leaves ordinary text alone', () => {
    expect(redact('Could not place the navigation item.')).toBe('Could not place the navigation item.');
    expect(redact('task-list and sk-8 stay')).toBe('task-list and sk-8 stay');
  });

  it('redacts inside errors and objects, and drops stacks', () => {
    const error = new Error(`401 for ${fakeKey('xai-')}`);

    expect(redactValue(error)).toBe('Error: 401 for [redacted]');
    expect(redactValue({ headers: { authorization: `Bearer ${fakeKey('')}` } })).toBe(
      '{"headers":{"authorization":"[redacted]"}}',
    );
  });

  it('passes numbers and booleans through', () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
  });
});
