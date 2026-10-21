import { createSvgIcon, el } from '@/core/dom';
import { CLOSE_ICON } from '@/core/icons';

import { COPY, EXTERNAL, LOCK, RELOAD } from '../icons';
import { box, createCursor, glide, place, post, tap, text } from '../kit';
import type { Scene } from '../picture';
import { EASE, spring, type Stop, type Style } from '../timeline';

/** The preview window's place on the stage, and the link it grows out of. */
const DIALOG = { x: 20, y: 12, w: 472, h: 264 };
const LINK = { x: 218, y: 70, w: 75, h: 16 };

/** Where the width buttons and the close button are, to aim the pointer at. */
const BUTTONS = {
  phone: { x: 220, y: 30 },
  tablet: { x: 274, y: 30 },
  desktop: { x: 332, y: 30 },
  close: { x: 477, y: 30 },
};

/** The page's own box inside the window at each width, and how the window frames it: bare at full width, else a device. */
const FRAME = {
  desktop: {
    left: '0px',
    top: '0px',
    width: '470px',
    height: '226px',
    borderRadius: '0px',
    borderColor: 'transparent',
    boxShadow: '0 0 0 0 transparent',
  },
  phone: {
    left: '160px',
    top: '8px',
    width: '150px',
    height: '210px',
    borderRadius: '8px',
    borderColor: 'var(--border)',
    boxShadow: '0 8px 24px -12px rgb(0 0 0 / 0.4)',
  },
  tablet: {
    left: '85px',
    top: '8px',
    width: '300px',
    height: '210px',
    borderRadius: '8px',
    borderColor: 'var(--border)',
    boxShadow: '0 8px 24px -12px rgb(0 0 0 / 0.4)',
  },
} as const;

/** Where each width button sits along the control, and how wide it is. */
const SIZES = [
  { name: 'phone', label: 'Phone', x: 2, w: 52 },
  { name: 'tablet', label: 'Tablet', x: 56, w: 52 },
  { name: 'desktop', label: 'Desktop', x: 110, w: 60 },
] as const;

type Size = (typeof SIZES)[number]['name'];

/** A made-up website's feature tile. */
function tile(): HTMLElement {
  return box('tile', [el('i'), el('b'), el('b', { attrs: { style: 'width: 55%' } })]);
}

/** Press and hold a link: its page grows out of it into a window, with phone, tablet and desktop widths. */
export const preview: Scene = {
  lane: 3,
  duration: 9800,
  poster: 4950,
  build(t) {
    const root = box('preview');

    // The log underneath, with a link in a commit.
    const feed = place(
      box('sheet feed', [
        post({
          name: 'Ada Quinn',
          handle: '@adaq',
          time: '12m',
          lane: 3,
          avatarLanes: [3, 1],
          body: [
            'Shipped my side project: a tiny uptime monitor.',
            box('', ['Feedback welcome → ', text('url', 'tinyapp.dev')]),
          ],
        }),
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
          time: '3h',
          lane: 4,
          avatarLanes: [4, 2],
          body: 'Reading the Rust book again. It lands differently the second time.',
        }),
      ]),
      { x: 16, y: 14, w: 480, h: 330 },
    );

    // The page in the window: a website of its own, always light, as the pages in a preview are.
    const viewport = box('viewport', [
      box('site', [
        box('top', [box('mark'), 'tinyapp', box('links', [el('i'), el('i')])]),
        el('h3', {}, ['Know when your site is ', el('em', {}, ['down.'])]),
        box('sub', ['Checks every minute and tells you first.']),
        box('cta', ['Start free']),
        box('tiles', [tile(), tile(), tile()]),
      ]),
    ]);

    // The window: the page's address, a control for its width, and a few actions.
    const thumb = box('thumb');
    const sizes = SIZES.map(({ label, x, w }) => place(box('size', [label]), { x, y: 2, w, h: 22 }));
    const actions = [
      [RELOAD, 358],
      [COPY, 386],
      [EXTERNAL, 414],
      [CLOSE_ICON, 442],
    ] as const;
    const dialog = place(
      box('sheet dialog', [
        box('bar', [
          box('address', [createSvgIcon(LOCK, ''), text('host', 'tinyapp.dev'), text('path', '/launch')]),
          box('sizes', [thumb, ...sizes]),
          ...actions.map(([icon, x]) => place(box('action', [createSvgIcon(icon, '')]), { x, y: 3 })),
        ]),
        box('stage-area', [place(viewport, { x: 0, y: 0 })]),
      ]),
      DIALOG,
    );

    // The window grows out of the link under the held pointer, with a little overshoot, and goes back into it.
    const centre = { x: DIALOG.x + DIALOG.w / 2, y: DIALOG.y + DIALOG.h / 2 };
    const away = {
      translate: `${String(LINK.x + LINK.w / 2 - centre.x)}px ${String(LINK.y + LINK.h / 2 - centre.y)}px`,
      scale: 0.1,
    };
    const here = { translate: '0px 0px', scale: 1 };
    const dim = box('dim');

    t.track(dim, [
      [0, { opacity: 0 }, EASE.hold],
      [2150, { opacity: 0 }, EASE.out],
      [2600, { opacity: 1 }, EASE.hold],
      [8600, { opacity: 1 }, EASE.out],
      [9050, { opacity: 0 }],
    ]);
    t.track(dialog, [
      [0, away, EASE.hold],
      [2150, away, spring(0.2, 6.5)],
      [2950, here, EASE.hold],
      [8600, here, EASE.inOut],
      [9100, away],
    ]);
    t.track(dialog, [
      [0, { opacity: 0 }, EASE.hold],
      [2150, { opacity: 0 }, EASE.out],
      [2300, { opacity: 1 }, EASE.hold],
      [8900, { opacity: 1 }, EASE.out],
      [9100, { opacity: 0 }],
    ]);

    // The width the page is shown at, and the control that says which: phone, then tablet, then back to desktop.
    const spring_ = spring(0.12);

    t.track(viewport, [
      [0, FRAME.desktop, EASE.hold],
      [4200, FRAME.desktop, spring_],
      [4900, FRAME.phone, EASE.hold],
      [5700, FRAME.phone, spring_],
      [6400, FRAME.tablet, EASE.hold],
      [7100, FRAME.tablet, spring_],
      [7800, FRAME.desktop],
    ]);

    // Which width the page is at, over time; the control's thumb slides there and its label takes the accent.
    const widths: [number, Size][] = [
      [0, 'desktop'],
      [4200, 'phone'],
      [5700, 'tablet'],
      [7100, 'desktop'],
    ];
    const tint = (name: Size, now: Size): Style => ({
      color: name === now ? 'var(--primary)' : 'var(--muted-foreground)',
    });

    SIZES.forEach(({ name }, index) => {
      t.track(
        sizes[index] ?? thumb,
        widths.flatMap(([at, now], step): Stop[] => {
          const before = widths[step - 1]?.[1];

          return before === undefined
            ? [[at, tint(name, now), EASE.hold]]
            : [
                [at, tint(name, before), EASE.out],
                [at + 300, tint(name, now), EASE.hold],
              ];
        }),
      );
    });

    const slot = (name: Size): Style => {
      const { x, w } = SIZES.find((size) => size.name === name) ?? SIZES[2];

      return { translate: `${String(x - 2)}px 0px`, width: `${String(w)}px` };
    };

    t.track(thumb, [
      [0, slot('desktop'), EASE.hold],
      [4200, slot('desktop'), spring(0.1)],
      [4800, slot('phone'), EASE.hold],
      [5700, slot('phone'), spring(0.1)],
      [6300, slot('tablet'), EASE.hold],
      [7100, slot('tablet'), spring(0.1)],
      [7700, slot('desktop')],
    ]);

    const cursor = createCursor();

    glide(t, cursor, [
      [0, 500, 310],
      [900, 500, 310],
      [1900, LINK.x + 38, LINK.y + 8],
      [3200, LINK.x + 38, LINK.y + 8],
      [4000, BUTTONS.phone.x, BUTTONS.phone.y],
      [5000, BUTTONS.phone.x, BUTTONS.phone.y],
      [5500, BUTTONS.tablet.x, BUTTONS.tablet.y],
      [6500, BUTTONS.tablet.x, BUTTONS.tablet.y],
      [6900, BUTTONS.desktop.x, BUTTONS.desktop.y],
      [7900, BUTTONS.desktop.x, BUTTONS.desktop.y],
      [8450, BUTTONS.close.x, BUTTONS.close.y],
      [9300, 440, 150],
    ]);
    t.track(cursor.element, [
      [0, { opacity: 0 }, EASE.hold],
      [900, { opacity: 0 }, EASE.out],
      [1150, { opacity: 1 }, EASE.linear],
      [9100, { opacity: 1 }, EASE.out],
      [9400, { opacity: 0 }],
    ]);
    tap(t, cursor, [{ at: 2000, hold: 700 }, { at: 4150 }, { at: 5650 }, { at: 7050 }, { at: 8550 }]);

    root.append(feed, dim, dialog, cursor.element);

    return root;
  },
};
