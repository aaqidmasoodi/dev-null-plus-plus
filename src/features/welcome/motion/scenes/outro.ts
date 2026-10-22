import { createLogoMark } from '@/core/brand';
import { createSvgIcon } from '@/core/dom';

import { NAV_BELL, NAV_COMMIT, NAV_LOG, NAV_SEARCH, NAV_SETTINGS, NAV_USER, STAR } from '../icons';
import { box, createCursor, glide, place, post, tap, text } from '../kit';
import type { Scene } from '../picture';
import { EASE, spring } from '../timeline';

const ITEMS = [
  { label: 'Log', icon: NAV_LOG },
  { label: 'Notifications', icon: NAV_BELL },
  { label: 'Profile', icon: NAV_USER },
  { label: 'Starred', icon: STAR },
  { label: 'Settings', icon: NAV_SETTINGS },
] as const;

const OPTIONS = [
  { title: 'Rewrite with AI', hint: 'Polish a draft in the composer.' },
  { title: 'Link preview', hint: 'Press and hold a link.' },
  { title: 'Image peek', hint: 'Press and hold a picture.' },
  { title: 'Picture-in-picture', hint: 'Videos float while you scroll.' },
] as const;

/** Where the pointer goes: the new item under Settings, and the Off and On of one switch. */
const NAV_ITEM = { x: 100, y: 188 };
const SWITCH = { off: { x: 415, y: 191 }, on: { x: 453, y: 191 } };

/** The last picture: where dev/null++ lives, under Settings, and that every feature can be switched off. */
export const outro: Scene = {
  lane: 0,
  duration: 8200,
  poster: 2800,
  build(t) {
    const root = box('outro');

    // The site's left navigation, with dev/null++ under Settings.
    const here = box('item here', [box('glow'), createLogoMark(''), '/dev/null++']);
    const glow = here.firstElementChild;
    const nav = box('nav', [
      ...ITEMS.map(({ label, icon }) => box('item', [createSvgIcon(icon, ''), label])),
      here,
      box('item', [createSvgIcon(NAV_SEARCH, ''), 'Search']),
      box('item commit', [createSvgIcon(NAV_COMMIT, ''), 'Commit']),
    ]);

    // Its settings page: a switch for each feature.
    const thumbs: HTMLElement[] = [];
    const rows = OPTIONS.map(({ title, hint }, index) => {
      const thumb = box('thumb');
      const off = place(text('', 'Off'), { x: 2, y: 2 });
      const on = place(text('', 'On'), { x: 40, y: 2 });
      const row = place(box('option', [box('words', [el5(title), el6(hint)]), box('segmented', [thumb, off, on])]), {
        x: 12,
        y: 48 + index * 52,
      });

      thumb.style.translate = '38px 0px';
      thumbs.push(thumb);

      return { row, thumb, off, on };
    });
    const settings = place(box('sheet settings', [box('title', ['/dev/null++']), ...rows.map(({ row }) => row)]), {
      x: 200,
      y: 14,
    });

    // The site's own page is in the middle column until ours takes its place.
    const page = place(
      box('sheet feed', [
        post({
          name: 'Ada Quinn',
          handle: '@adaq',
          time: '12m',
          lane: 3,
          avatarLanes: [3, 1],
          body: 'Shipped my side project: a tiny uptime monitor.',
        }),
        post({
          name: 'Jun Okafor',
          handle: '@junok',
          time: '1h',
          lane: 5,
          avatarLanes: [5, 0],
          body: 'Hot take: tabs versus spaces is solved.',
        }),
      ]),
      { x: 200, y: 14, w: 296, h: 260 },
    );

    t.track(page, [
      [0, { opacity: 1 }, EASE.hold],
      [1900, { opacity: 1 }, EASE.out],
      [2400, { opacity: 0 }],
    ]);
    t.track(settings, [
      [0, { opacity: 0, translate: '10px 0px' }, EASE.hold],
      [1900, { opacity: 0, translate: '10px 0px' }, EASE.out],
      [2500, { opacity: 1, translate: '0px 0px' }],
    ]);
    if (glow instanceof HTMLElement) {
      t.track(glow, [
        [0, { opacity: 0 }, EASE.hold],
        [1800, { opacity: 0 }, EASE.out],
        [2050, { opacity: 1 }],
      ]);
    }

    // Image peek is switched off, and back on.
    const peek = rows[2];

    if (peek !== undefined) {
      const spring_ = spring(0.12, 10);

      t.track(peek.thumb, [
        [0, { translate: '38px 0px' }, EASE.hold],
        [3600, { translate: '38px 0px' }, spring_],
        [4150, { translate: '0px 0px' }, EASE.hold],
        [5400, { translate: '0px 0px' }, spring_],
        [5950, { translate: '38px 0px' }],
      ]);

      const choice = (off: boolean, on: boolean): { color: string } => ({
        color: off || on ? 'var(--primary)' : 'var(--muted-foreground)',
      });

      t.track(peek.off, [
        [0, choice(false, false), EASE.hold],
        [3600, choice(false, false), EASE.out],
        [3800, choice(true, false), EASE.hold],
        [5400, choice(true, false), EASE.out],
        [5600, choice(false, false)],
      ]);
      t.track(peek.on, [
        [0, choice(true, false), EASE.hold],
        [3600, choice(true, false), EASE.out],
        [3800, choice(false, false), EASE.hold],
        [5400, choice(false, false), EASE.out],
        [5600, choice(true, false)],
      ]);
      t.track(peek.row, [
        [0, { opacity: 1 }, EASE.hold],
        [3600, { opacity: 1 }, EASE.out],
        [3900, { opacity: 0.55 }, EASE.hold],
        [5400, { opacity: 0.55 }, EASE.out],
        [5700, { opacity: 1 }],
      ]);
    }

    const cursor = createCursor();

    glide(t, cursor, [
      [0, 500, 310],
      [600, 500, 310],
      [1600, NAV_ITEM.x, NAV_ITEM.y],
      [2500, NAV_ITEM.x, NAV_ITEM.y],
      [3400, SWITCH.off.x, SWITCH.off.y],
      [4700, SWITCH.off.x, SWITCH.off.y],
      [5200, SWITCH.on.x, SWITCH.on.y],
      [6200, SWITCH.on.x, SWITCH.on.y],
      [6900, 440, 280],
    ]);
    t.track(cursor.element, [
      [0, { opacity: 0 }, EASE.hold],
      [600, { opacity: 0 }, EASE.out],
      [850, { opacity: 1 }, EASE.linear],
      [6400, { opacity: 1 }, EASE.out],
      [6800, { opacity: 0 }],
    ]);
    tap(t, cursor, [{ at: 1800 }, { at: 3600 }, { at: 5400 }]);

    root.append(nav, page, settings, cursor.element);

    return root;
  },
};

function el5(content: string): HTMLElement {
  const heading = document.createElement('h5');

  heading.textContent = content;

  return heading;
}

function el6(content: string): HTMLElement {
  const line = document.createElement('p');

  line.textContent = content;

  return line;
}
