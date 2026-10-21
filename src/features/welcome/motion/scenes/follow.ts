import { createSvgIcon } from '@/core/dom';
import { CLOSE_ICON } from '@/core/icons';

import { USER_CHECK, USER_PLUS } from '../icons';
import { avatar, box, createCursor, glide, tap, text } from '../kit';
import type { Scene } from '../picture';
import { EASE, spring } from '../timeline';

/** Where each card in the stack rests, top first, as in the extension. */
const RESTING = [
  { y: 0, scale: 1 },
  { y: 8, scale: 0.95 },
  { y: 16, scale: 0.9 },
] as const;

const rest = (depth: number): { translate: string; scale: number } => {
  const { y, scale } = RESTING[Math.min(depth, 2)] ?? RESTING[2];

  return { translate: `0px ${String(y)}px`, scale };
};

interface Person {
  name: string;
  handle: string;
  bio: string;
  reason: string;
  lanes: readonly [number, number];
}

const PEOPLE: readonly [Person, Person, Person, Person] = [
  {
    name: 'Lena Park',
    handle: '@lenap',
    bio: 'Compilers, Rust and strong coffee.',
    reason: 'Followed by @adaq',
    lanes: [4, 2],
  },
  {
    name: 'Theo Marsh',
    handle: '@theom',
    bio: 'Building tiny tools for tiny teams.',
    reason: 'Followed by @junok',
    lanes: [3, 1],
  },
  {
    name: 'Ines Duarte',
    handle: '@inesd',
    bio: 'Databases, bikes and bad puns.',
    reason: 'Followed by @minas',
    lanes: [0, 5],
  },
  {
    name: 'Kofi Mensah',
    handle: '@kofim',
    bio: 'Open source, mostly docs.',
    reason: 'Followed by @rint',
    lanes: [2, 4],
  },
];

/** The card, with the picture big and the details under it, and the same buttons as the extension. */
function card(person: Person): {
  element: HTMLElement;
  follow: HTMLElement;
  following: HTMLElement;
  primary: HTMLElement;
} {
  const follow = box('', [createSvgIcon(USER_PLUS, ''), 'Follow']);
  const following = box('', [createSvgIcon(USER_CHECK, ''), 'Following']);
  const primary = box('follow', [follow, following]);
  const element = box('wcard', [
    box('picture-box', [avatar('', person.lanes)]),
    box('info', [
      text('who', person.name),
      box('username', [box('', []), person.handle]),
      box('bio', [person.bio]),
      box('reason', [person.reason]),
      box('buttons', [box('dismiss', [createSvgIcon(CLOSE_ICON, '')]), primary]),
    ]),
  ]);

  element.style.setProperty('--lane', `var(--lane-${String(person.lanes[0])})`);

  return { element, follow, following, primary };
}

/** Who to follow as a stack of cards: swipe one away, and someone new takes its place; follow from the card. */
export const follow: Scene = {
  lane: 1,
  duration: 9800,
  poster: 5900,
  build(t) {
    const root = box('follow-scene');
    const [one, two, three, four] = PEOPLE;
    const stack = [card(one), card(two), card(three), card(four)] as const;
    const [first, second, third, fourth] = [stack[0].element, stack[1].element, stack[2].element, stack[3].element];
    const heading = document.createElement('h4');
    const world = box('world', [heading, first, second, third, fourth]);

    heading.textContent = 'Who to follow';

    // The one on top is in front of the ones behind it.
    [first, second, third, fourth].forEach((element, index) => {
      element.style.zIndex = String(4 - index);
    });

    // The first card is swiped away, with the drag: it turns as it goes, and leaves.
    const pull = 3000;
    const gone = 3450;

    t.track(first, [
      [0, { translate: '0px 0px', rotate: '0deg', opacity: 1 }, EASE.hold],
      [2500, { translate: '0px 0px', rotate: '0deg', opacity: 1 }, EASE.inOut],
      [pull, { translate: '120px 14px', rotate: '6deg', opacity: 1 }, EASE.in],
      [gone + 350, { translate: '420px 70px', rotate: '21deg', opacity: 0 }],
    ]);

    // Each card behind comes up one place, and someone new joins at the back.
    const spring_ = spring(0.18, 10);

    t.track(second, [
      [0, rest(1), EASE.hold],
      [pull, rest(1), spring_],
      [pull + 650, rest(0)],
    ]);
    t.track(third, [
      [0, rest(2), EASE.hold],
      [pull, rest(2), spring_],
      [pull + 650, rest(1)],
    ]);
    t.track(fourth, [
      [0, { ...rest(2), opacity: 0 }, EASE.hold],
      [pull + 300, { ...rest(2), opacity: 0 }, EASE.out],
      [pull + 700, { ...rest(2), opacity: 1 }],
    ]);

    // The view looks at the picture first, then moves down to the details and the buttons.
    t.track(world, [
      [0, { translate: '0px 0px' }, EASE.hold],
      [1000, { translate: '0px 0px' }, EASE.inOut],
      [1900, { translate: '0px -132px' }],
    ]);

    // Following: the button changes from the primary look to the quiet outline, with its icon.
    const { follow: label, following: done, primary } = stack[1];
    const base = { backgroundColor: 'var(--primary)', borderColor: 'transparent', color: 'var(--primary-foreground)' };
    const quiet = { backgroundColor: 'var(--background)', borderColor: 'var(--input)', color: 'var(--primary)' };

    t.track(primary, [
      [0, base, EASE.hold],
      [5200, base, EASE.out],
      [5450, quiet],
    ]);
    t.track(label, [
      [0, { opacity: 1 }, EASE.hold],
      [5200, { opacity: 1 }, EASE.out],
      [5400, { opacity: 0 }],
    ]);
    t.track(done, [
      [0, { opacity: 0 }, EASE.hold],
      [5250, { opacity: 0 }, EASE.out],
      [5450, { opacity: 1 }],
    ]);

    // The pointer takes the card by its details, pulls it aside, then follows the next person.
    const cursor = createCursor();
    const grip = { x: 232, y: 190 };
    const follows = { x: 292, y: 246 };

    glide(t, cursor, [
      [0, 500, 310],
      [1900, 500, 310],
      [2400, grip.x, grip.y],
      [2500, grip.x, grip.y],
      [pull, grip.x + 120, grip.y + 14],
      [gone, grip.x + 150, grip.y + 24],
      [4300, follows.x, follows.y],
      [5900, follows.x, follows.y],
      [6600, 430, 290],
    ]);
    t.track(cursor.element, [
      [0, { opacity: 0 }, EASE.hold],
      [1900, { opacity: 0 }, EASE.out],
      [2150, { opacity: 1 }, EASE.linear],
      [6200, { opacity: 1 }, EASE.out],
      [6600, { opacity: 0 }],
    ]);
    tap(t, cursor, [{ at: 2500, hold: pull - 2500 + 60 }, { at: 5150 }]);

    root.append(world, cursor.element);

    return root;
  },
};
