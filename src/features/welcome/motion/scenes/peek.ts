import { box, code, createCursor, glide, place, post, sunset, tap } from '../kit';
import type { Scene } from '../picture';
import { EASE } from '../timeline';

/** Where the picture sits in the commit, and how big it grows: as wide as will fit, with the dimmed log around it. */
const PHOTO = { x: 74, y: 80, w: 202, h: 148 };
const BIG = { w: 358, h: 262 };

/** How long the picture takes to grow and to go back, as in the extension. */
const GROW = 340;
const RETURN = 240;

/** Press and hold a picture: it grows out of the page to fill the view, and goes back when you let go. */
export const peek: Scene = {
  lane: 4,
  duration: 6400,
  poster: 3000,
  build(t) {
    const root = box('peek-scene');

    // The log, with a commit that has two pictures.
    const photo = sunset();
    const feed = place(
      box('sheet feed', [
        post({
          name: 'Ada Quinn',
          handle: '@adaq',
          time: '2h',
          lane: 4,
          avatarLanes: [4, 2],
          body: 'Sunrise over the bay this morning.',
          media: box('media', [photo, code()]),
        }),
      ]),
      { x: 16, y: 17, w: 480, h: 270 },
    );

    // The picture as it is held up: the same picture, growing from where it was, and the page dimmed behind it.
    const dim = box('dim');
    const copy = place(box('peek', [sunset()]), PHOTO);
    const small = { translate: '0px 0px', scale: 1 };
    const scale = BIG.w / PHOTO.w;
    const big = {
      translate: `${String((512 - BIG.w) / 2 - PHOTO.x)}px ${String((288 - BIG.h) / 2 - PHOTO.y)}px`,
      scale,
    };
    const pop = { translate: big.translate, scale: scale * 1.025 };
    const grow = 1800 + 150;
    const release = 3500;

    t.track(copy, [
      [grow, small, 'cubic-bezier(0.3, 0, 0.2, 1)'],
      [grow + GROW * 0.78, pop, 'cubic-bezier(0.3, 0, 0.4, 1)'],
      [grow + GROW, big, EASE.hold],
      [release, big, 'cubic-bezier(0.4, 0, 0.2, 1)'],
      [release + RETURN, small],
    ]);
    t.track(copy, [
      [0, { opacity: 0 }, EASE.hold],
      [grow, { opacity: 1 }, EASE.hold],
      [release + RETURN, { opacity: 1 }, EASE.hold],
      [release + RETURN + 1, { opacity: 0 }],
    ]);
    t.track(dim, [
      [0, { opacity: 0 }, EASE.hold],
      [grow, { opacity: 0 }, EASE.out],
      [grow + GROW * 0.8, { opacity: 1 }, EASE.hold],
      [release, { opacity: 1 }, 'ease-out'],
      [release + RETURN, { opacity: 0 }],
    ]);
    // The original is out of the way while its copy is up.
    t.track(photo, [
      [0, { opacity: 1 }, EASE.hold],
      [grow, { opacity: 1 }, EASE.hold],
      [grow + 1, { opacity: 0 }, EASE.hold],
      [release + RETURN, { opacity: 0 }, EASE.hold],
      [release + RETURN + 1, { opacity: 1 }],
    ]);

    const cursor = createCursor();
    const target = { x: PHOTO.x + PHOTO.w * 0.55, y: PHOTO.y + PHOTO.h * 0.55 };

    glide(t, cursor, [
      [0, 500, 310],
      [700, 500, 310],
      [1700, target.x, target.y],
      [release + 200, target.x, target.y],
      [release + 900, 440, 250],
    ]);
    t.track(cursor.element, [
      [0, { opacity: 0 }, EASE.hold],
      [700, { opacity: 0 }, EASE.out],
      [950, { opacity: 1 }, EASE.linear],
      [release + 800, { opacity: 1 }, EASE.out],
      [release + 1100, { opacity: 0 }],
    ]);
    tap(t, cursor, [{ at: 1800, hold: release - 1800 }]);

    root.append(feed, dim, copy, cursor.element);

    return root;
  },
};
