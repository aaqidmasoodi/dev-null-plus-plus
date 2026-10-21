import { createSvgIcon, el } from '@/core/dom';

import { ARROW_UP } from '../icons';
import { box, place, post, text } from '../kit';
import type { Scene } from '../picture';
import { EASE, spin } from '../timeline';

/** How tall a commit is in the log, so the older ones can make room for the new. */
const ROW = 88;
const NEW = 2;

/** New commits arrive: the log's pill says so, then loads them by itself, and they slide in tinted. */
export const commits: Scene = {
  lane: 5,
  duration: 8600,
  poster: 4000,
  build(t) {
    const root = box('commits');

    const older = box('older', [
      post({
        name: 'Jun Okafor',
        handle: '@junok',
        time: '1h',
        lane: 5,
        avatarLanes: [5, 0],
        body: 'Hot take: tabs versus spaces is solved. The formatter won.',
      }),
      post({
        name: 'Mina Sato',
        handle: '@minas',
        time: '2h',
        lane: 0,
        avatarLanes: [0, 5],
        body: 'The talk on rate limiting is up. Watch the second half.',
      }),
      post({
        name: 'Ada Quinn',
        handle: '@adaq',
        time: '3h',
        lane: 3,
        avatarLanes: [3, 1],
        body: 'Shipped my side project: a tiny uptime monitor.',
      }),
    ]);
    const fresh = [
      post({
        name: 'Rin Tanaka',
        handle: '@rint',
        time: '1m',
        lane: 4,
        avatarLanes: [4, 2],
        body: 'Got the CI down to 90 seconds. Cache the right things.',
      }),
      post({
        name: 'Sam Ortiz',
        handle: '@samo',
        time: '2m',
        lane: 1,
        avatarLanes: [1, 3],
        body: 'A backup you have not restored is only a hope.',
      }),
    ];
    const newer = box('newer', fresh);

    // The older commits make room, and the new ones fade and settle in, tinted until they have been seen.
    const arrive = 3500;

    t.track(older, [
      [0, { translate: '0px 0px' }, EASE.hold],
      [arrive, { translate: '0px 0px' }, EASE.out],
      [arrive + 600, { translate: `0px ${String(ROW * NEW)}px` }],
    ]);
    t.track(newer, [
      [0, { opacity: 0, translate: '0px -8px' }, EASE.hold],
      [arrive, { opacity: 0, translate: '0px -8px' }, EASE.out],
      [arrive + 600, { opacity: 1, translate: '0px 0px' }],
    ]);
    fresh.forEach((row) => {
      t.track(row, [
        [0, { backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)' }, EASE.hold],
        [6200, { backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)' }, EASE.inOut],
        [7400, { backgroundColor: 'color-mix(in srgb, var(--primary) 0%, transparent)' }],
      ]);
    });

    // The pill: it appears over the log, settles into "Fetching…", and says what arrived before it goes.
    const label = (content: string, icon: Node): HTMLElement => el('span', {}, [icon, content]);
    const spinner = box('spinner');
    const waiting = label('2 new commits', createSvgIcon(ARROW_UP, ''));
    const fetching = label('Fetching 2 new commits…', spinner);
    const loaded = label('2 loaded', createSvgIcon(ARROW_UP, ''));
    const pill = box('pill', [waiting, fetching, loaded]);

    t.track(pill, [
      [0, { opacity: 0, translate: '0px -6px', scale: 0.92 }, EASE.hold],
      [1200, { opacity: 0, translate: '0px -6px', scale: 0.92 }, EASE.out],
      [1550, { opacity: 1, translate: '0px 0px', scale: 1 }, EASE.hold],
      [4300, { opacity: 1, translate: '0px 0px', scale: 1 }, EASE.in],
      [4800, { opacity: 0, translate: '0px -6px', scale: 1 }],
    ]);
    // It is as wide as what it says.
    t.track(pill, [
      [0, { width: '148px', marginLeft: '-74px' }, EASE.hold],
      [2300, { width: '148px', marginLeft: '-74px' }, EASE.out],
      [2700, { width: '212px', marginLeft: '-106px' }, EASE.hold],
      [3500, { width: '212px', marginLeft: '-106px' }, EASE.out],
      [3900, { width: '118px', marginLeft: '-59px' }],
    ]);
    t.track(waiting, [
      [0, { opacity: 1 }, EASE.hold],
      [2300, { opacity: 1 }, EASE.out],
      [2550, { opacity: 0 }],
    ]);
    t.track(fetching, [
      [0, { opacity: 0 }, EASE.hold],
      [2400, { opacity: 0 }, EASE.out],
      [2700, { opacity: 1 }, EASE.hold],
      [3500, { opacity: 1 }, EASE.out],
      [3700, { opacity: 0 }],
    ]);
    t.track(loaded, [
      [0, { opacity: 0 }, EASE.hold],
      [3600, { opacity: 0 }, EASE.out],
      [3900, { opacity: 1 }],
    ]);
    t.track(spinner, spin(2400, 3800));

    const feed = place(
      box('sheet feed', [
        box('tabs', [text('', 'Following'), text('current', 'Latest'), text('', 'Trending')]),
        box('rows', [older, newer]),
      ]),
      { x: 16, y: 14, w: 480, h: 300 },
    );

    root.append(feed, pill);

    return root;
  },
};
