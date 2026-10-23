import { PRESETS } from '@/themes/presets';
import type { Palette, Shadow } from '@/themes/schema';

import { box, createCursor, glide, place, post, tap } from '../kit';
import type { Scene } from '../picture';
import { EASE, type Stop } from '../timeline';

/** When each theme is picked, in the order the picker shows them, and when the loop comes back to the first. */
const FIRST_TAP = 1300;
const EVERY = 1250;
const SWATCH = { size: 40, gap: 14, y: 222 };

function swatchX(index: number): number {
  const row = PRESETS.length * SWATCH.size + (PRESETS.length - 1) * SWATCH.gap;

  return (512 - row) / 2 + index * (SWATCH.size + SWATCH.gap);
}

function backdrop(palette: Palette): string {
  const stops = palette.backdrop.length > 1 ? palette.backdrop : [palette.backdrop[0], palette.backdrop[0]];

  return `linear-gradient(180deg, ${stops.join(', ')})`;
}

function shadow(value: Shadow, palette: Palette): string {
  switch (value.kind) {
    case 'none':
      return '0 0 0 0 transparent';
    case 'soft':
      return `0 ${String(value.y)}px ${String(value.blur)}px 0 color-mix(in srgb, ${palette.ink} ${String(Math.round(value.opacity * 100))}%, transparent)`;
    case 'hard':
      return `${String(value.x)}px ${String(value.y)}px 0 0 ${palette.ink}`;
  }
}

/** The page, as a theme draws it: its colours and shapes, as the picture's own tokens. */
function look(index: number): { page: Record<string, string>; sheet: Record<string, string> } {
  const theme = PRESETS[index % PRESETS.length] ?? PRESETS[0];
  const palette = theme.palettes[theme.signature];

  return {
    page: { background: backdrop(palette) },
    sheet: {
      '--card': palette.card,
      '--foreground': palette.cardForeground,
      '--muted-foreground': palette.mutedForeground,
      '--border': palette.border,
      '--primary': palette.primary,
      '--radius': `${String(Math.round(theme.shape.radius * 0.66))}px`,
      borderWidth: `${String(Math.min(theme.shape.border, 3))}px`,
      boxShadow: shadow(theme.depth.card, palette),
    },
  };
}

/** Pick a theme and the whole page changes with it: its backdrop, its cards, its colours and its shapes. */
export const themes: Scene = {
  lane: 2,
  duration: FIRST_TAP + EVERY * PRESETS.length + 500,
  poster: FIRST_TAP + EVERY * 2 + 400,
  build(t) {
    const root = box('themes-scene');
    const page = place(box('theme-page'), { x: 0, y: 0, w: 512, h: 288 });
    const sheet = place(
      box('sheet theme-sheet', [
        post({
          name: 'Ada Quinn',
          handle: '@adaq',
          time: '2m',
          lane: 2,
          avatarLanes: [2, 4],
          body: 'Same log, whole new look.',
        }),
      ]),
      { x: 66, y: 52, w: 380, h: 116 },
    );
    const swatches = PRESETS.map((theme, index) => {
      const palette = theme.palettes[theme.signature];
      const swatch = place(box('theme-swatch'), {
        x: swatchX(index),
        y: SWATCH.y,
        w: SWATCH.size,
        h: SWATCH.size,
      });

      swatch.style.setProperty('--swatch-backdrop', backdrop(palette));
      swatch.style.setProperty('--swatch-card', palette.card);
      swatch.style.setProperty('--swatch-primary', palette.primary);

      return swatch;
    });

    // The first theme from the start, then each in turn as it is tapped, and the first again at the end.
    const pageStops: Stop[] = [];
    const sheetStops: Stop[] = [];

    for (let step = 0; step <= PRESETS.length; step += 1) {
      const at = step === 0 ? 0 : FIRST_TAP + EVERY * (step - 1) + 80;
      const { page: pageLook, sheet: sheetLook } = look(step === 0 ? 0 : step % PRESETS.length);

      pageStops.push([at, pageLook, EASE.hold]);
      sheetStops.push([at, sheetLook, EASE.hold]);
    }

    t.track(page, pageStops);
    t.track(sheet, sheetStops);

    // The picked swatch is ringed.
    swatches.forEach((swatch, index) => {
      const picked = (on: boolean): Stop[1] => ({ outlineColor: on ? 'var(--primary, #3b6fe0)' : 'transparent' });
      const pickedAt =
        index === 0 ? FIRST_TAP + EVERY * (PRESETS.length - 1) + 80 : FIRST_TAP + EVERY * (index - 1) + 80;
      const stops: Stop[] =
        index === 0
          ? [
              [0, picked(true), EASE.hold],
              [FIRST_TAP + 80, picked(false), EASE.hold],
              [pickedAt, picked(true), EASE.hold],
            ]
          : [
              [0, picked(false), EASE.hold],
              [pickedAt, picked(true), EASE.hold],
              [pickedAt + EVERY, picked(false), EASE.hold],
            ];

      t.track(swatch, stops);
    });

    // The pointer goes from swatch to swatch, tapping each.
    const cursor = createCursor();
    const order = [...PRESETS.keys()].slice(1).concat(0);
    const taps = order.map((index, step) => ({ index, at: FIRST_TAP + EVERY * step }));
    const centre = (index: number): [number, number] => [
      swatchX(index) + SWATCH.size * 0.6,
      SWATCH.y + SWATCH.size * 0.6,
    ];

    glide(t, cursor, [
      [0, 470, 300],
      [500, 470, 300],
      ...taps.flatMap(({ index, at }): [number, number, number][] => {
        const [x, y] = centre(index);

        return [
          [at - 450, x, y],
          [at + 150, x, y],
        ];
      }),
      [t.duration - 200, 470, 300],
    ]);
    t.track(cursor.element, [
      [0, { opacity: 0 }, EASE.hold],
      [400, { opacity: 0 }, EASE.out],
      [700, { opacity: 1 }, EASE.hold],
      [t.duration - 400, { opacity: 1 }, EASE.out],
      [t.duration - 150, { opacity: 0 }],
    ]);
    tap(
      t,
      cursor,
      taps.map(({ at }) => ({ at })),
    );

    root.append(page, sheet, ...swatches, cursor.element);

    return root;
  },
};
