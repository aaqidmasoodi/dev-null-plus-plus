import { isSiteUrl, SITE_ORIGIN } from './constants';

/**
 * Every message between the extension's parts goes through here. Each side checks both what was sent (its shape) and
 * who sent it, and ignores anything that fails either check.
 */

export interface OpenSettingsMessage {
  type: 'dnpp:open-settings';
}

/** Messages the background sends to the content script on dev-null.sh tabs. */
export type ContentMessage = OpenSettingsMessage;

export function isContentMessage(value: unknown): value is ContentMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 1 &&
    (value as { type?: unknown }).type === 'dnpp:open-settings'
  );
}

/** The parts of `runtime.MessageSender` the checks read, so they can be tested without a browser. */
export interface Sender {
  id?: string | undefined;
  tab?: { id?: number | undefined; url?: string | undefined } | undefined;
  frameId?: number | undefined;
  url?: string | undefined;
  origin?: string | undefined;
}

/** For content scripts: the message came from this extension's own background, not from a tab or another extension. */
export function isFromOwnBackground(sender: Sender, extensionId: string): boolean {
  return sender.id === extensionId && sender.tab === undefined;
}

/**
 * For the background: the message came from this extension's content script, in the top frame of a dev-null.sh tab.
 * A compromised or spoofed sender anywhere else, including a dev-null.sh page loaded in a frame on another site, fails.
 */
export function isFromSiteContentScript(sender: Sender, extensionId: string): boolean {
  if (sender.id !== extensionId || sender.tab?.id === undefined || sender.frameId !== 0) {
    return false;
  }

  // Chrome reports `origin`; Firefox only `url`. Either way it has to be dev-null.sh.
  const fromSite = sender.origin === undefined ? isSiteUrl(sender.url) : sender.origin === SITE_ORIGIN;

  return fromSite && isSiteUrl(sender.tab.url);
}
