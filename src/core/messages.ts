export interface OpenSettingsMessage {
  type: 'dnpp:open-settings';
}

/** Messages the background sends to the content script on dev-null.sh tabs. */
export type ContentMessage = OpenSettingsMessage;

export function isContentMessage(value: unknown): value is ContentMessage {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'dnpp:open-settings';
}
