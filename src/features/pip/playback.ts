/**
 * Whether the video in our player is playing, as far as can be told. The player is another site's frame, so only
 * providers that report it can say: YouTube through its iframe API, Vimeo through player.js events. For the rest it
 * stays unknown, which counts as playing once started. Ported from dev-null.sh pull request #686
 * (resources/js/lib/video-player-state.ts).
 *
 * This is the one place the extension exchanges messages with a frame. It only ever talks to our own player's frame,
 * only to that provider's exact origin, and only reads one field of what comes back: never the page, never a frame the
 * site made.
 */

export type Playback = 'playing' | 'paused' | 'unknown';

type PlayerApi = 'youtube' | 'vimeo';

function playerApi(src: string): PlayerApi | null {
  try {
    const { hostname, protocol } = new URL(src);

    if (protocol !== 'https:') {
      return null;
    }

    if (/(^|\.)youtube(-nocookie)?\.com$/.test(hostname)) {
      return 'youtube';
    }

    if (hostname === 'player.vimeo.com') {
      return 'vimeo';
    }
  } catch {
    return null;
  }

  return null;
}

/** YouTube only reports its state to pages that ask for its API, and only to the origin they name. */
export function playerApiSrc(src: string, origin: string): string {
  if (playerApi(src) !== 'youtube') {
    return src;
  }

  const url = new URL(src);

  url.searchParams.set('enablejsapi', '1');
  url.searchParams.set('origin', origin);

  return url.toString();
}

function parsed(data: unknown): Record<string, unknown> | null {
  if (typeof data === 'string') {
    // Providers send small JSON strings; anything large is not one of their messages.
    if (data.length > 10_000) {
      return null;
    }

    try {
      const value: unknown = JSON.parse(data);

      return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
}

/** YouTube's states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued. Buffering is still playing. */
function youtubePlayback(state: unknown): Playback | null {
  if (state === 1 || state === 3) {
    return 'playing';
  }

  return state === -1 || state === 0 || state === 2 || state === 5 ? 'paused' : null;
}

export function playbackFromMessage(src: string, data: unknown): Playback | null {
  const api = playerApi(src);
  const message = parsed(data);

  if (api === null || message === null) {
    return null;
  }

  if (api === 'youtube') {
    if (message.event === 'onStateChange') {
      return youtubePlayback(message.info);
    }

    const info = parsed(message.info);

    return message.event === 'infoDelivery' && info !== null ? youtubePlayback(info.playerState) : null;
  }

  if (message.event === 'play' || message.event === 'playing') {
    return 'playing';
  }

  return message.event === 'pause' || message.event === 'ended' ? 'paused' : null;
}

/** The messages that ask a player to report its state, sent again until it answers, as it may not be listening yet. */
export function subscriptionMessages(src: string): string[] {
  const api = playerApi(src);

  if (api === 'youtube') {
    return [
      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
      JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 1, channel: 'widget' }),
    ];
  }

  if (api === 'vimeo') {
    return ['play', 'pause', 'ended'].map((value) => JSON.stringify({ method: 'addEventListener', value }));
  }

  return [];
}

/** Reports our player's playback as it changes, until the returned function is called. */
export function watchPlayback(
  frame: HTMLIFrameElement,
  src: string,
  onChange: (playback: Playback) => void,
): () => void {
  const messages = subscriptionMessages(src);

  if (messages.length === 0) {
    return () => undefined;
  }

  const origin = new URL(src).origin;
  let hasAnswered = false;
  let attempts = 0;
  const subscribe = (): void => {
    for (const message of messages) {
      // eslint-disable-next-line no-restricted-properties -- Only to our own player's frame, pinned to its provider's origin.
      frame.contentWindow?.postMessage(message, origin);
    }
  };
  const retry = window.setInterval(() => {
    if (hasAnswered || ++attempts > 40) {
      window.clearInterval(retry);

      return;
    }

    subscribe();
  }, 250);
  const onMessage = (event: MessageEvent): void => {
    // Only our own frame, speaking from its provider's origin. Everything else on the page is ignored.
    if (event.source !== frame.contentWindow || event.origin !== origin) {
      return;
    }

    // A player's first word is usually that it is ready, which is when asking it to report is sure to be heard.
    if (!hasAnswered) {
      hasAnswered = true;
      subscribe();
    }

    const playback = playbackFromMessage(src, event.data);

    if (playback !== null) {
      onChange(playback);
    }
  };

  window.addEventListener('message', onMessage);
  frame.addEventListener('load', subscribe);

  return () => {
    window.clearInterval(retry);
    window.removeEventListener('message', onMessage);
    frame.removeEventListener('load', subscribe);
  };
}

type FullscreenTarget = HTMLElement & { webkitRequestFullscreen?: () => void };

/** Safari on iPad only knows the prefixed API, and Safari on iPhone can't put a frame full screen at all. */
export function canGoFullscreen(
  page: Pick<Document, 'fullscreenEnabled'> & { webkitFullscreenEnabled?: boolean } = document,
): boolean {
  return page.fullscreenEnabled || page.webkitFullscreenEnabled === true;
}

export function goFullscreen(element: FullscreenTarget): void {
  if (typeof element.requestFullscreen === 'function') {
    void element.requestFullscreen().catch(() => undefined);

    return;
  }

  element.webkitRequestFullscreen?.();
}
