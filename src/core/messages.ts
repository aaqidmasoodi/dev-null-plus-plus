import { isInstruction, isRewriteMode, MAX_DRAFT_LENGTH, type RewriteMode } from './ai';
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

/** Asks the background to rewrite a draft. Sent by the content script; the reply is a `RewriteResult`. */
export interface RewriteMessage {
  type: 'dnpp:ai-rewrite';
  text: string;
  mode: RewriteMode;
  /** The user's own words for `custom`; empty for a preset. */
  instruction: string;
  /** The composer's own length limit, which the rewrite must fit. */
  maxLength: number;
}

/** Messages the content script sends to the background. */
export type BackgroundMessage = RewriteMessage;

export function isBackgroundMessage(value: unknown): value is BackgroundMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const message = value as Record<string, unknown>;

  return (
    Object.keys(message).sort().join() === 'instruction,maxLength,mode,text,type' &&
    message.type === 'dnpp:ai-rewrite' &&
    typeof message.text === 'string' &&
    message.text.length <= MAX_DRAFT_LENGTH &&
    isRewriteMode(message.mode) &&
    isInstruction(message.instruction) &&
    // A custom rewrite needs the user's words; a preset carries none.
    (message.mode === 'custom') === (message.instruction.trim() !== '') &&
    typeof message.maxLength === 'number' &&
    Number.isInteger(message.maxLength) &&
    message.maxLength > 0 &&
    message.maxLength <= MAX_DRAFT_LENGTH
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
