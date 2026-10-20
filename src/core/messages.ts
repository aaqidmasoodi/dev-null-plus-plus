export interface TogglePanelMessage {
  type: 'dnpp:toggle-panel';
}

/** Messages the background sends to the content script on dev-null.sh tabs. */
export type ContentMessage = TogglePanelMessage;

export function isContentMessage(value: unknown): value is ContentMessage {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'dnpp:toggle-panel';
}
