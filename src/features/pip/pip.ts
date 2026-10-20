import { observeAttributes, observeDom } from '@/core/dom';
import { onRouteChange } from '@/core/route';
import {
  canFloat,
  floatingVideoEmbeds,
  isEmbedPlayPress,
  isShown,
  pressedVideoEmbed,
  rememberPlayedCard,
  siteFrameIn,
  type VideoEmbed,
} from '@/site/embeds';

import { Cards, type Card, type PipButton } from './cards';
import { loadPlacements } from './placement';
import { Player } from './player';

/** How long, after play is pressed, the site has to put its player in. */
const FRAME_WAIT_MS = 3_000;

export interface PictureInPictureOptions {
  /** Whether the feature is on, read whenever it matters. */
  enabled: () => boolean;
  /** Whether a playing video floats by itself when scrolled past or left. */
  automatic: () => boolean;
  signal: AbortSignal;
}

/** The site's frame for a video, as it made it: where it points and what it allows. */
interface Source {
  src: string;
  allow: string;
  sandbox: string | null;
  referrerPolicy: string;
}

function isHttpsUrl(value: string | null): value is string {
  if (value === null) {
    return false;
  }

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Picture-in-picture for the site's video embeds, from any provider the site plays.
 *
 * When play is pressed on a video in the main page, the site puts its provider's frame in the post as usual. We read
 * where it points and what it allows, empty it before it can load, and play the video in our own player instead: one
 * that lives outside the site's page, so moving to another page never stops it. Everything else, floating, pinning and
 * coming home, is the player's. Over the posts, we show what the site would: "Playing in picture-in-picture" and Play
 * here while it floats, the picture-in-picture button while it plays in a post, and the poster again once it stops.
 *
 * Videos in chats, dialogs and other panels play in place, as the site plays them; starting one stops ours, so only
 * one video plays at a time.
 */
export class PictureInPicture {
  readonly #options: PictureInPictureOptions;
  readonly #cards = new Cards();
  /** Where each video we played came from, by video, to play it again. */
  readonly #sources = new Map<string, Source>();
  /** Cards whose site frame we emptied: they can't show their poster again, so we do. */
  readonly #takenOver = new WeakSet<HTMLElement>();
  #player: Player | null = null;
  #syncFrame = 0;

  constructor(options: PictureInPictureOptions) {
    this.#options = options;

    const { signal } = options;
    const resizes = new ResizeObserver(this.#scheduleSync);

    void loadPlacements();
    resizes.observe(document.body);
    window.addEventListener('click', this.#onClick, { capture: true, signal });
    window.addEventListener('resize', this.#scheduleSync, { signal });
    observeDom(this.#scheduleSync, signal);
    onRouteChange(this.#scheduleSync, signal);
    observeAttributes(document.documentElement, ['class'], this.#applyTheme, signal);
    this.#applyTheme();
    signal.addEventListener(
      'abort',
      () => {
        resizes.disconnect();
        this.destroy();
      },
      { once: true },
    );
  }

  /** Settings changed: turned off, it stops; automatic or not, the player looks again. */
  refresh(): void {
    if (!this.#options.enabled()) {
      this.#player?.end();
    }

    this.#player?.wake();
    this.#scheduleSync();
  }

  destroy(): void {
    cancelAnimationFrame(this.#syncFrame);
    this.#player?.end();
    this.#player = null;
    this.#cards.destroy();
  }

  readonly #onClick = (event: MouseEvent): void => {
    if (!this.#options.enabled() || !isEmbedPlayPress(event.target)) {
      return;
    }

    const embed = pressedVideoEmbed(event.target);

    // Audio and code embeds play as they always have.
    if (embed === null) {
      return;
    }

    // In a chat, a dialog or another panel, the site plays it in place. Only one video plays at a time.
    if (!canFloat(embed.card)) {
      this.#player?.end();

      return;
    }

    rememberPlayedCard(embed);
    this.#takeOverOnceFramed(embed);
  };

  /** The site puts its frame in as it handles the press; we take over as soon as it is there, before it loads. */
  #takeOverOnceFramed(embed: VideoEmbed): void {
    const observer = new MutationObserver(() => {
      const frame = siteFrameIn(embed.card);

      if (frame !== null) {
        observer.disconnect();
        clearTimeout(timeout);
        this.#takeOver(embed, frame);
      }
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
    }, FRAME_WAIT_MS);

    observer.observe(embed.card, { childList: true, subtree: true });
  }

  #takeOver(embed: VideoEmbed, frame: HTMLIFrameElement): void {
    const src = frame.getAttribute('src');

    // Not a player we can safely run ourselves: the site keeps playing it as it does.
    if (!isHttpsUrl(src)) {
      return;
    }

    const source: Source = {
      src,
      allow: frame.getAttribute('allow') ?? '',
      sandbox: frame.getAttribute('sandbox'),
      referrerPolicy: frame.getAttribute('referrerpolicy') ?? 'strict-origin-when-cross-origin',
    };

    // The site's own frame for it is emptied before it loads, so the video never plays twice. React keeps the element
    // and never sets its address again, as nothing it renders from changes.
    frame.setAttribute('src', 'about:blank');
    this.#takenOver.add(embed.card);
    this.#sources.set(embed.key, source);
    this.#play(embed, source);
  }

  /** Plays a video in our player, starting in this embed. Another video playing is replaced. */
  #play(embed: VideoEmbed, source: Source): void {
    this.#player?.end();

    const player = new Player({
      video: {
        key: embed.key,
        title: embed.title,
        aspectRatio: embed.aspectRatio,
        pagePath: location.pathname,
        ...source,
      },
      slot: embed.slot,
      isAutomatic: () => this.#options.automatic(),
      slotsFor: (key) =>
        floatingVideoEmbeds()
          .filter((candidate) => candidate.key === key && isShown(candidate.slot))
          .map((candidate) => candidate.slot),
      onEnd: () => {
        if (this.#player === player) {
          this.#player = null;
        }

        this.#scheduleSync();
      },
      onChange: this.#scheduleSync,
    });

    this.#player = player;
    this.#applyTheme();
    this.#scheduleSync();
  }

  readonly #applyTheme = (): void => {
    const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

    this.#player?.setTheme(theme);
    this.#cards.setTheme(theme);
  };

  readonly #scheduleSync = (): void => {
    if (this.#syncFrame === 0) {
      this.#syncFrame = requestAnimationFrame(() => {
        this.#syncFrame = 0;
        this.#sync();
      });
    }
  };

  /** Puts the right card over each video embed, and the picture-in-picture button under the one playing in a post. */
  #sync(): void {
    if (!this.#options.enabled()) {
      this.#cards.destroy();

      return;
    }

    const player = this.#player;
    const cards: Card[] = [];
    let pip: PipButton | null = null;

    for (const embed of floatingVideoEmbeds()) {
      if (!isShown(embed.slot)) {
        continue;
      }

      const shared = { slot: embed.slot, poster: embed.poster, title: embed.title };

      if (player !== null && embed.key === player.video.key) {
        if (player.slot !== embed.slot) {
          cards.push({
            ...shared,
            kind: player.isFloating ? 'elsewhere-pip' : 'elsewhere-post',
            onPlay: () => {
              player.playHere(embed.slot);
            },
          });
        } else if (player.heldSlot === embed.slot) {
          if (embed.row !== null) {
            pip = {
              row: embed.row,
              onPress: () => {
                player.popOut();
              },
            };
          }
        } else {
          // On its way in: only the poster, so nothing shows behind it as it lands.
          cards.push({ ...shared, kind: 'poster', onPlay: () => undefined });
        }

        continue;
      }

      const source = this.#sources.get(embed.key);

      if (this.#takenOver.has(embed.card) && source !== undefined) {
        cards.push({
          ...shared,
          kind: 'replay',
          onPlay: () => {
            this.#play(embed, source);
          },
        });
      }
    }

    this.#cards.render(cards, pip);
  }
}
