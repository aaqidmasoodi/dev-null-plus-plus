import { createLogoMark } from '@/core/brand';

import { box, text } from '../kit';
import type { Scene } from '../picture';
import { EASE, spring, typeText } from '../timeline';

/** The welcome's first picture: the two slashes slide together into the mark, and the name is typed under it. */
export const intro: Scene = {
  lane: 0,
  duration: 5600,
  poster: 3300,
  build(t) {
    const root = box('intro');

    // Two soft lights drifting behind, in the site's colours.
    const lights = [
      { lane: 0, x: 30, y: 40, to: '60px -30px' },
      { lane: 3, x: 290, y: 90, to: '-50px 30px' },
    ].map(({ lane, x, y, to }) => {
      const light = box('blob');

      light.style.left = `${String(x)}px`;
      light.style.top = `${String(y)}px`;
      light.style.background = `var(--lane-${String(lane)})`;
      t.track(light, [
        [0, { translate: '0px 0px' }, EASE.inOut],
        [2800, { translate: to }, EASE.inOut],
        [5600, { translate: '0px 0px' }],
      ]);

      return light;
    });

    // The mark: its solid slash comes in from the left and its outlined one from the right, and they settle together.
    const mark = createLogoMark('');
    const [solid, outlined] = mark.querySelectorAll('path');
    const holder = box('mark-box', [mark]);

    if (solid !== undefined && outlined !== undefined) {
      const from = (x: number): { translate: string } => ({ translate: `${String(x)}px 0px` });
      const together = { translate: '0px 0px' };

      t.track(solid, [
        [300, from(-90), spring(0.28, 9)],
        [1300, together],
      ]);
      t.track(outlined, [
        [450, from(90), spring(0.28, 9)],
        [1450, together],
      ]);

      for (const [slash, at] of [
        [solid, 300],
        [outlined, 450],
      ] as const) {
        t.track(slash, [
          [0, { opacity: 0 }, EASE.hold],
          [at, { opacity: 0 }, EASE.out],
          [at + 250, { opacity: 1 }],
        ]);
      }
    }

    t.track(holder, [
      [300, { scale: 0.92 }, spring(0.2, 8)],
      [1500, { scale: 1 }],
    ]);

    // The name, typed with a caret in the accent, the second slash outlined as it is on the site.
    const name = box('wordmark');
    const end = typeText(t, name, '/dev/null++', 1500, 85, 3300);

    name.children[4]?.classList.add('slash');

    const tagline = text('tagline', 'Extra powers for /dev/null');

    t.track(tagline, [
      [0, { opacity: 0, translate: '0px 6px' }, EASE.hold],
      [end + 150, { opacity: 0, translate: '0px 6px' }, EASE.out],
      [end + 750, { opacity: 1, translate: '0px 0px' }],
    ]);

    root.append(...lights, holder, name, tagline);

    return root;
  },
};
