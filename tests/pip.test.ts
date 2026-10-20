// @vitest-environment-options {"url": "https://dev-null.sh/log/latest"}

import { afterEach, describe, expect, it } from 'vitest';

import {
  POP_OUT_BELOW,
  RESTING_VELOCITY,
  RETURN_ABOVE,
  afterEmbedLeft,
  closeAction,
  cornerBox,
  departureBox,
  dockSize,
  isSpringSettled,
  nearestCorner,
  returnsByItself,
  stepSpring,
  visibleFraction,
} from '@/features/pip/geometry';
import { playbackFromMessage, playerApiSrc, subscriptionMessages } from '@/features/pip/playback';
import { PictureInPicture } from '@/features/pip/pip';
import { canFloat, readVideoEmbed } from '@/site/embeds';

const wide = { width: 1280, height: 800 };

describe('the floating player’s geometry', () => {
  it('floats once under a quarter shows, and comes back once 60% does', () => {
    expect(POP_OUT_BELOW).toBe(0.25);
    expect(RETURN_ABOVE).toBe(0.6);
    expect(visibleFraction({ top: -150, height: 200 }, wide)).toBe(0.25);
    // What is under a sticky header counts as hidden.
    expect(visibleFraction({ top: 0, height: 200 }, wide, 100)).toBe(0.5);
    expect(visibleFraction({ top: 700, height: 200 }, wide, 0, 750)).toBe(0.25);
  });

  it('keeps the video’s shape, between its smallest and what fits', () => {
    expect(dockSize(360, 16 / 9, wide)).toEqual({ width: 360, height: 203 });
    expect(dockSize(50, 16 / 9, wide).width).toBe(200);
    // A portrait video is as tall as a landscape one is wide.
    expect(dockSize(360, 9 / 16, wide)).toEqual({ width: 203, height: 360 });
  });

  it('rests in its corner below headers and above bottom bars', () => {
    const size = { width: 360, height: 203 };

    expect(cornerBox('bottom-right', size, wide)).toEqual({ x: 896, y: 545, ...size });
    expect(cornerBox('bottom-right', size, wide, [{ left: 0, right: 1280, top: 740 }]).y).toBe(485);
    expect(cornerBox('top-left', size, wide, [], [{ left: 0, right: 1280, bottom: 60 }]).y).toBe(76);
  });

  it('lands where it is flung', () => {
    expect(nearestCorner({ x: 600, y: 300 }, { x: 0, y: 0 }, wide)).toBe('top-left');
    expect(nearestCorner({ x: 600, y: 300 }, { x: 2, y: 1 }, wide)).toBe('bottom-right');
  });

  it('sets off from the sliver last seen at the edge it left by', () => {
    const left = departureBox({ x: 0, y: -1000, width: 400, height: 200 }, wide, 60);

    expect(left.y).toBe(60 + 50 - 200);
  });

  it('closes back into a post only if enough of it shows', () => {
    expect(closeAction(0.5)).toBe('return');
    expect(closeAction(0.1)).toBe('stop');
    expect(closeAction(null)).toBe('stop');
  });

  it('floats a playing video whose page is left, and never a paused one', () => {
    expect(afterEmbedLeft(true, false, false)).toBe('float');
    expect(afterEmbedLeft(true, true, false)).toBe('stop');
    expect(afterEmbedLeft(false, false, true)).toBe('return');
  });

  it('brings back by itself only a video that floated by itself', () => {
    expect(returnsByItself(true, false)).toBe(true);
    expect(returnsByItself(true, true)).toBe(false);
    expect(returnsByItself(false, false)).toBe(false);
  });

  it('springs onto its target and settles there', () => {
    const target = { x: 100, y: 200, width: 300, height: 150 };
    let spring = { position: { x: 0, y: 0, width: 200, height: 100 }, velocity: RESTING_VELOCITY };

    for (let frame = 0; frame < 120; frame++) {
      spring = stepSpring(spring, target, 1 / 60);
    }

    expect(isSpringSettled(spring, target)).toBe(true);
  });
});

describe('what a player says', () => {
  const youtube = 'https://www.youtube-nocookie.com/embed/abc?autoplay=1';

  it('asks YouTube to report, to this page only', () => {
    const src = new URL(playerApiSrc(youtube, 'https://dev-null.sh'));

    expect(src.searchParams.get('enablejsapi')).toBe('1');
    expect(src.searchParams.get('origin')).toBe('https://dev-null.sh');
    expect(playerApiSrc('https://player.example/v/1', 'https://dev-null.sh')).toBe('https://player.example/v/1');
  });

  it('reads YouTube and Vimeo states, and nothing else', () => {
    expect(playbackFromMessage(youtube, JSON.stringify({ event: 'onStateChange', info: 1 }))).toBe('playing');
    expect(playbackFromMessage(youtube, JSON.stringify({ event: 'onStateChange', info: 2 }))).toBe('paused');
    expect(playbackFromMessage(youtube, { event: 'infoDelivery', info: { playerState: 0 } })).toBe('paused');
    expect(playbackFromMessage('https://player.vimeo.com/video/1', { event: 'play' })).toBe('playing');
    expect(playbackFromMessage(youtube, 'not json')).toBeNull();
    expect(playbackFromMessage('https://player.example/v/1', { event: 'play' })).toBeNull();
    expect(subscriptionMessages('https://player.example/v/1')).toEqual([]);
  });
});

const VIDEO_CARD = `
  <div data-test="link-embed" data-provider="YouTube">
    <div>
      <button type="button" data-test="link-embed-play" aria-label="Play A talk from YouTube" style="aspect-ratio: 16 / 9">
        <img src="https://i.ytimg.com/vi/abc/maxresdefault.jpg" alt="">
      </button>
    </div>
    <a href="https://www.youtube.com/watch?v=abc">YouTube · A talk</a>
  </div>`;

/** An element the test put there, or a clear failure if it isn't. */
const element = (selector: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(selector);

  if (found === null) {
    throw new Error(`${selector} is missing.`);
  }

  return found;
};

describe('video embeds', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('are read from the site’s play button', () => {
    document.body.innerHTML = `<div id="app"><main data-main>${VIDEO_CARD}</main></div>`;

    const embed = readVideoEmbed(element('[data-test="link-embed"]'));

    expect(embed?.title).toBe('Play A talk from YouTube');
    expect(embed?.poster).toBe('https://i.ytimg.com/vi/abc/maxresdefault.jpg');
    expect(embed?.aspectRatio).toBeCloseTo(16 / 9);
    expect(embed?.row?.tagName).toBe('A');
  });

  it('leave out audio and quoted embeds', () => {
    document.body.innerHTML = `
      <div data-test="link-embed" id="audio"><div><button data-test="link-embed-play" aria-label="Play">x</button></div></div>
      <div data-test="link-embed" id="quoted"><div><span style="aspect-ratio: 16 / 9"></span></div></div>`;

    expect(readVideoEmbed(element('#audio'))).toBeNull();
    expect(readVideoEmbed(element('#quoted'))).toBeNull();
  });

  it('float only from the main page, not chats or dialogs', () => {
    document.body.innerHTML = `
      <div id="app"><main data-main><div id="post">${VIDEO_CARD}</div><div role="dialog">${VIDEO_CARD}</div></main></div>
      <div data-test="chat-dock">${VIDEO_CARD}</div>`;

    const [post, dialog, chat] = [...document.querySelectorAll<HTMLElement>('[data-test="link-embed"]')];

    expect(post && canFloat(post)).toBe(true);
    expect(dialog && canFloat(dialog)).toBe(false);
    expect(chat && canFloat(chat)).toBe(false);
  });
});

describe('pressing play', () => {
  let controller: AbortController;

  afterEach(() => {
    controller.abort();
    document.documentElement.querySelectorAll('[data-dnpp]').forEach((node) => {
      node.remove();
    });
    document.body.innerHTML = '';
  });

  /** Like the site: pressing play swaps the button for the provider's frame. */
  const siteSwapsInFrame = (): void => {
    document.addEventListener('click', (event) => {
      const button = (event.target as Element).closest('[data-test="link-embed-play"]');

      if (button === null) {
        return;
      }

      const frame = document.createElement('iframe');

      frame.setAttribute('src', 'https://www.youtube-nocookie.com/embed/abc?autoplay=1');
      frame.setAttribute('allow', 'autoplay; fullscreen');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      button.replaceWith(frame);
    });
  };

  const start = (enabled = true): void => {
    controller = new AbortController();
    new PictureInPicture({ enabled: () => enabled, automatic: () => true, signal: controller.signal });
    siteSwapsInFrame();
  };

  const press = (): void => {
    document.querySelector<HTMLButtonElement>('[data-test="link-embed-play"]')?.click();
  };

  const ourFrame = (): HTMLIFrameElement | null | undefined =>
    document.querySelector('[data-dnpp="pip-player"]')?.shadowRoot?.querySelector('iframe');

  it('plays the video in our player, and empties the site’s before it loads', async () => {
    document.body.innerHTML = `<div id="app"><main data-main>${VIDEO_CARD}</main></div>`;
    start();
    press();
    await Promise.resolve();

    expect(document.querySelector('[data-test="link-embed"] iframe')?.getAttribute('src')).toBe('about:blank');

    const frame = ourFrame();

    expect(frame?.src).toContain('https://www.youtube-nocookie.com/embed/abc?autoplay=1');
    expect(frame?.src).toContain('enablejsapi=1');
    // Exactly what the site would have given the provider.
    expect(frame?.getAttribute('allow')).toBe('autoplay; fullscreen');
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(frame?.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
  });

  it('leaves the site to play videos in chats and dialogs, and stops ours', async () => {
    document.body.innerHTML = `<div id="app"><main data-main>${VIDEO_CARD}<div role="dialog">${VIDEO_CARD}</div></main></div>`;
    start();
    press();
    await Promise.resolve();
    expect(ourFrame()).toBeTruthy();

    document.querySelector<HTMLButtonElement>('[role="dialog"] [data-test="link-embed-play"]')?.click();
    await Promise.resolve();

    expect(ourFrame()).toBeFalsy();
    expect(document.querySelector('[role="dialog"] iframe')?.getAttribute('src')).toContain('youtube-nocookie');
  });

  it('does nothing when turned off', async () => {
    document.body.innerHTML = `<div id="app"><main data-main>${VIDEO_CARD}</main></div>`;
    start(false);
    press();
    await Promise.resolve();

    expect(ourFrame()).toBeFalsy();
    expect(document.querySelector('[data-test="link-embed"] iframe')?.getAttribute('src')).toContain(
      'youtube-nocookie',
    );
  });
});
