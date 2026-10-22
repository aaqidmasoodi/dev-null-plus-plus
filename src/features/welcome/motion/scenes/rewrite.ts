import { createSvgIcon } from '@/core/dom';
import { SPARKLES_ICON } from '@/features/ai-rewrite/composer-ai';

import { IMAGE, SCHEDULE } from '../icons';
import { box, createCursor, glide, place, tap, text } from '../kit';
import type { Scene } from '../picture';
import { EASE, repeat, spin, typeText } from '../timeline';

const DRAFT = 'fixed login bug. was a race in session refresh, kept logging ppl out. works now';
const REWRITTEN =
  'Fixed a login bug: a race condition in session refresh was randomly logging people out. All good now.';

/** The composer with its AI button: open the panel, pick Improve, and the draft is rewritten in place. */
export const rewrite: Scene = {
  lane: 2,
  duration: 9400,
  poster: 8000,
  build(t) {
    const root = box('rewrite');

    // The draft: the words as they are typed, the same words rewritten, and a soft light that sweeps while it works.
    const typed = box('typed');
    const rewritten = box('rewritten', [REWRITTEN]);
    const sweep = box('sweep');
    const draft = box('draft', [typed, rewritten, sweep]);

    typeText(t, typed, DRAFT, 400, 24, 2900);
    t.track(typed, [
      ...repeat(4850, 7250, 1600, [{ opacity: 1 }, { opacity: 0.55 }]),
      [7250, { opacity: 0 }, EASE.hold],
    ]);
    // The new words arrive as the extension swaps them in: a quick fade out of a slight blur.
    t.track(rewritten, [
      [7250, { opacity: 0 }, EASE.hold],
      [7251, { opacity: 0.2 }, EASE.out],
      [7530, { opacity: 1 }],
    ]);
    t.track(rewritten, [
      [7250, { filter: 'blur(2px)' }, EASE.out],
      [7530, { filter: 'blur(0px)' }],
    ]);
    t.track(sweep, [
      [4850, { opacity: 0 }, EASE.hold],
      [4851, { opacity: 1 }, EASE.hold],
      [7250, { opacity: 1 }, EASE.hold],
      [7251, { opacity: 0 }],
    ]);
    t.track(sweep, [
      [4850, { backgroundPosition: '100% 0' }, EASE.inOut],
      [5650, { backgroundPosition: '0% 0' }, EASE.inOut],
      [6450, { backgroundPosition: '-100% 0' }, EASE.hold],
      [6451, { backgroundPosition: '100% 0' }, EASE.inOut],
      [7250, { backgroundPosition: '-100% 0' }],
    ]);

    // The toolbar: the site's image and schedule buttons, and ours beside them.
    const sparkles = createSvgIcon(SPARKLES_ICON, '');
    const aiButton = box('tool ai', [sparkles]);
    const toolbar = box('toolbar', [
      box('tool', [createSvgIcon(IMAGE, '')]),
      box('tool', [createSvgIcon(SCHEDULE, '')]),
      aiButton,
      box('spacer'),
      box('go', ['Commit']),
    ]);

    t.track(aiButton, [
      [3300, { backgroundColor: 'transparent', color: 'var(--muted-foreground)' }, EASE.out],
      [3480, { backgroundColor: 'var(--primary-soft)', color: 'var(--primary)' }],
    ]);
    t.track(sparkles, [
      [4850, { scale: 1, rotate: '0deg' }, EASE.inOut],
      ...repeat(4850, 7250, 900, [
        { scale: 1, rotate: '0deg' },
        { scale: 1.18, rotate: '12deg' },
      ]),
    ]);

    // The panel the button opens, as the extension builds it.
    const spinner = box('spinner');
    const slot = box('spin-slot', [spinner]);
    const improve = box('preset', [slot, text('label', 'Improve')]);
    const others = ['Shorten', 'Fix grammar', 'Casual', 'Professional'].map((label) => box('preset', [label]));
    const hint = text('hint', 'Rewrites your draft in place. Pick a preset, or say how you want it and press Enter.');
    const working = text('shimmer', 'Rewriting…');
    const done = box('done', ['Rewritten.', text('link', 'Undo')]);
    const status = box('status', [hint, working, done]);
    const panel = box('panel', [
      box('head', [text('title', 'Rewrite'), text('brand', 'dev/null++')]),
      box('field', [createSvgIcon(SPARKLES_ICON, ''), 'How should it read? e.g. punchier, add a bit of humour']),
      box('presets', [improve, ...others]),
      status,
    ]);

    place(panel, { x: 12, y: 60, w: 454 });
    t.track(panel, [
      [3560, { opacity: 0, translate: '0 -4px' }, EASE.out],
      [3900, { opacity: 1, translate: '0 0' }],
    ]);
    t.track(hint, [
      [0, { opacity: 1 }, EASE.hold],
      [4850, { opacity: 1 }, EASE.out],
      [5000, { opacity: 0 }],
    ]);
    t.track(working, [
      [4850, { opacity: 0 }, EASE.out],
      [5000, { opacity: 1 }, EASE.linear],
      [7250, { opacity: 1 }, EASE.out],
      [7350, { opacity: 0 }],
    ]);
    t.track(working, [
      [5000, { backgroundPosition: '100% 0' }, EASE.linear],
      [6400, { backgroundPosition: '-100% 0' }, EASE.hold],
      [6401, { backgroundPosition: '100% 0' }, EASE.linear],
      [7250, { backgroundPosition: '-100% 0' }],
    ]);
    t.track(done, [
      [7250, { opacity: 0, translate: '0 3px' }, EASE.out],
      [7500, { opacity: 1, translate: '0 0' }],
    ]);
    t.track(improve, [
      [
        4500,
        { backgroundColor: 'transparent', borderColor: 'var(--border)', color: 'var(--muted-foreground)' },
        EASE.out,
      ],
      [
        4650,
        { backgroundColor: 'var(--accent)', borderColor: 'var(--border)', color: 'var(--foreground)' },
        EASE.linear,
      ],
      [4800, { backgroundColor: 'var(--accent)', borderColor: 'var(--border)', color: 'var(--foreground)' }, EASE.out],
      [
        4950,
        { backgroundColor: 'var(--primary-soft)', borderColor: 'var(--primary)', color: 'var(--primary)' },
        EASE.linear,
      ],
      [
        7250,
        { backgroundColor: 'var(--primary-soft)', borderColor: 'var(--primary)', color: 'var(--primary)' },
        EASE.out,
      ],
      [7500, { backgroundColor: 'transparent', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }],
    ]);
    t.track(slot, [
      [4850, { width: '0px' }, EASE.out],
      [5050, { width: '17px' }, EASE.linear],
      [7250, { width: '17px' }, EASE.out],
      [7500, { width: '0px' }],
    ]);
    t.track(spinner, spin(4850, 7500));

    for (const preset of others) {
      t.track(preset, [
        [4850, { opacity: 1 }, EASE.out],
        [5050, { opacity: 0.5 }, EASE.linear],
        [7250, { opacity: 0.5 }, EASE.out],
        [7500, { opacity: 1 }],
      ]);
    }

    // The composer grows to make room for the panel, with the toolbar staying at its foot.
    const composer = place(box('sheet composer', [draft, panel, toolbar]), { x: 16, y: 0, w: 480, h: 258 });

    t.track(composer, [
      [3420, { height: '108px', translate: '0 90px' }, EASE.out],
      [4080, { height: '258px', translate: '0 15px' }],
    ]);

    // The tooltip the site shows above a button.
    const tip = place(box('tip', ['Rewrite with AI']), { x: 54, y: 118 });

    t.track(tip, [
      [2800, { opacity: 0, translate: '0 4px' }, EASE.out],
      [3000, { opacity: 1, translate: '0 0' }, EASE.linear],
      [3290, { opacity: 1, translate: '0 0' }, EASE.out],
      [3400, { opacity: 0, translate: '0 0' }],
    ]);

    const cursor = createCursor();

    glide(t, cursor, [
      [0, 500, 310],
      [1700, 500, 310],
      [2900, 110, 172],
      [3950, 110, 172],
      [4620, 76, 163],
      [5100, 76, 163],
      [5900, 340, 205],
      [8250, 340, 205],
      [8800, 430, 300],
    ]);
    t.track(cursor.element, [
      [0, { opacity: 0 }, EASE.hold],
      [1700, { opacity: 0 }, EASE.out],
      [1950, { opacity: 1 }, EASE.linear],
      [8250, { opacity: 1 }, EASE.out],
      [8600, { opacity: 0 }],
    ]);
    tap(t, cursor, [{ at: 3300 }, { at: 4800 }]);

    root.append(composer, tip, cursor.element);

    return root;
  },
};
