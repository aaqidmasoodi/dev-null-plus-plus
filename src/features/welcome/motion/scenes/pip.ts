import { createSvgIcon } from '@/core/dom';
import { CLOSE_ICON } from '@/core/icons';
import { PIP_ICON } from '@/features/pip/cards';

import { MAXIMIZE, PLAY } from '../icons';
import { box, createCursor, glide, place, post, sunset, tap, text } from '../kit';
import type { Scene } from '../picture';
import { EASE, spring, type Style } from '../timeline';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** The log's scroll, and how far it has gone when the video lets go of its commit and floats to a corner. */
const FEED_TOP = -8;
const SCROLLED = 300;
const LETS_GO = 190;

/** The video's place in its commit, and in each corner it docks to, with the controls that hang below. */
const IN_POST = { x: 73, y: FEED_TOP + 62, w: 408, h: 229 };
const BOTTOM_RIGHT = { x: 312, y: 125, w: 176, h: 99 };
const TOP_LEFT = { x: 24, y: 24, w: 176, h: 99 };

const at = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }): Style => ({
  translate: `${String(x)}px ${String(y)}px`,
  width: `${String(w)}px`,
  height: `${String(h)}px`,
});

/** The curved handle at a player's corner, drawn as the extension draws it. */
function handle(corner: string): SVGSVGElement | HTMLDivElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const arc = document.createElementNS(SVG_NAMESPACE, 'path');

  svg.setAttribute('viewBox', '0 0 40 40');
  arc.setAttribute('d', 'M7 26A19 19 0 0 1 26 7');
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke', 'currentColor');
  arc.setAttribute('stroke-width', '5');
  arc.setAttribute('stroke-linecap', 'round');
  svg.append(arc);

  return box(`handle ${corner}`, [svg]);
}

/** Scroll past a playing video and it floats to a corner; drag it anywhere; scroll back and it returns to its commit. */
export const pip: Scene = {
  lane: 0,
  duration: 9800,
  poster: 4300,
  build(t) {
    const root = box('pip');

    // The commit with the video, and the commits after it.
    const poster = sunset();
    const slot = place(
      box('slot', [
        box('poster', [sunset()]),
        box('elsewhere', [
          createSvgIcon(PIP_ICON, ''),
          'Playing in picture-in-picture',
          box('play-here', [createSvgIcon(PLAY, ''), 'Play here']),
        ]),
      ]),
      { x: 0, y: 0 },
    );
    const elsewhere = slot.querySelector('.elsewhere') ?? slot;

    slot.style.position = 'relative';
    slot.style.height = `${String(IN_POST.h)}px`;
    poster.remove();

    const feed = place(
      box('sheet feed', [
        post({
          name: 'Mina Sato',
          handle: '@minas',
          time: '40m',
          lane: 0,
          avatarLanes: [0, 5],
          body: 'The talk on rate limiting is up. Watch the second half.',
          media: slot,
          extra: box('pip', [createSvgIcon(PIP_ICON, '')]),
        }),
        post({
          name: 'Jun Okafor',
          handle: '@junok',
          time: '1h',
          lane: 5,
          avatarLanes: [5, 3],
          body: 'Hot take: tabs versus spaces is solved. The formatter won.',
        }),
        post({
          name: 'Ada Quinn',
          handle: '@adaq',
          time: '2h',
          lane: 3,
          avatarLanes: [3, 1],
          body: 'Shipped my side project: a tiny uptime monitor.',
        }),
      ]),
      { x: 16, y: FEED_TOP, w: 480, h: 760 },
    );

    t.track(feed, [
      [0, { translate: '0px 0px' }, EASE.hold],
      [1400, { translate: '0px 0px' }, 'ease-in'],
      [2300, { translate: `0px ${String(-LETS_GO)}px` }, 'cubic-bezier(0.3, 0.6, 0.5, 1)'],
      [3000, { translate: `0px ${String(-SCROLLED)}px` }, EASE.hold],
      [6400, { translate: `0px ${String(-SCROLLED)}px` }, EASE.inOut],
      [7400, { translate: '0px 0px' }],
    ]);
    t.track(elsewhere, [
      [0, { opacity: 0 }, EASE.hold],
      [2300, { opacity: 0 }, EASE.out],
      [2500, { opacity: 1 }, EASE.hold],
      [7700, { opacity: 1 }, EASE.out],
      [8000, { opacity: 0 }],
    ]);

    const scrollbar = place(box('scrollbar'), { x: 505, y: 8 });

    t.track(scrollbar, [
      [0, { translate: '0px 0px' }, EASE.hold],
      [1400, { translate: '0px 0px' }, 'ease-in'],
      [2300, { translate: '0px 20px' }, 'cubic-bezier(0.3, 0.6, 0.5, 1)'],
      [3000, { translate: '0px 36px' }, EASE.hold],
      [6400, { translate: '0px 36px' }, EASE.inOut],
      [7400, { translate: '0px 0px' }],
    ]);
    t.track(scrollbar, [
      [0, { opacity: 0 }, EASE.hold],
      [1300, { opacity: 0 }, EASE.out],
      [1500, { opacity: 0.8 }, EASE.hold],
      [3200, { opacity: 0.8 }, EASE.out],
      [3600, { opacity: 0 }, EASE.hold],
      [6300, { opacity: 0 }, EASE.out],
      [6500, { opacity: 0.8 }, EASE.hold],
      [7600, { opacity: 0.8 }, EASE.out],
      [8000, { opacity: 0 }],
    ]);

    // The player: the same video, over its commit, then floating, then back.
    const picture = sunset();
    const progress = document.createElement('i');
    const controls = box('controls', [
      handle('tl'),
      handle('tr'),
      handle('br'),
      handle('bl'),
      box('below', [
        box('round', [createSvgIcon(CLOSE_ICON, '')]),
        box('grabber', [text('', '')]),
        box('round', [createSvgIcon(MAXIMIZE, '')]),
      ]),
    ]);
    const player = box('player', [box('surface', [picture, box('progress', [progress])]), controls]);

    t.track(player, [
      [0, at(IN_POST), EASE.hold],
      [1400, at(IN_POST), 'ease-in'],
      [2300, at({ ...IN_POST, y: IN_POST.y - LETS_GO }), spring(0.2, 9)],
      [3000, at(BOTTOM_RIGHT), EASE.hold],
      [4000, at(BOTTOM_RIGHT), EASE.inOut],
      [5000, at(TOP_LEFT), spring(0.12, 10)],
      [5500, at(TOP_LEFT), EASE.hold],
      [7500, at(TOP_LEFT), spring(0.2, 9)],
      [8200, at(IN_POST)],
    ]);
    t.track(controls, [
      [0, { opacity: 0 }, EASE.hold],
      [3700, { opacity: 0 }, EASE.out],
      [3950, { opacity: 1 }, EASE.hold],
      [5800, { opacity: 1 }, EASE.out],
      [6300, { opacity: 0 }],
    ]);
    // The video is playing: its picture drifts, and the line along its foot fills.
    t.track(picture, [
      [0, { scale: 1.0, translate: '0px 0px' }, EASE.linear],
      [9800, { scale: 1.12, translate: '-14px -6px' }],
    ]);
    t.track(progress, [
      [0, { scale: '0.22 1' }, EASE.linear],
      [9800, { scale: '0.6 1' }],
    ]);

    // The pointer takes the grabber under the floating player and drags it to the opposite corner.
    const grabber = { x: BOTTOM_RIGHT.x + BOTTOM_RIGHT.w / 2, y: BOTTOM_RIGHT.y + BOTTOM_RIGHT.h + 8 + 16 };
    const dropped = { x: TOP_LEFT.x + TOP_LEFT.w / 2, y: TOP_LEFT.y + TOP_LEFT.h + 8 + 16 };
    const cursor = createCursor();

    glide(t, cursor, [
      [0, 500, 310],
      [3000, 500, 310],
      [3800, grabber.x, grabber.y],
      [4000, grabber.x, grabber.y],
      [5000, dropped.x, dropped.y],
      [5400, dropped.x, dropped.y],
      [6000, 300, 270],
    ]);
    t.track(cursor.element, [
      [0, { opacity: 0 }, EASE.hold],
      [3000, { opacity: 0 }, EASE.out],
      [3250, { opacity: 1 }, EASE.linear],
      [5700, { opacity: 1 }, EASE.out],
      [6000, { opacity: 0 }],
    ]);
    tap(t, cursor, [{ at: 4000, hold: 1000 }]);

    root.append(feed, scrollbar, player, cursor.element);

    return root;
  },
};
