/**
 * Colours in themes are only ever `#rrggbb`: easy to check, impossible to smuggle CSS through, and exact enough to
 * measure contrast with.
 */

export type Hex = `#${string}`;

const HEX = /^#[0-9a-f]{6}$/;

export function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && HEX.test(value);
}

function channels(hex: Hex): [number, number, number] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}

function toHex(values: readonly number[]): Hex {
  return `#${values
    .map((value) =>
      Math.round(Math.min(255, Math.max(0, value)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** WCAG 2's relative luminance. */
export function luminance(hex: Hex): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;

    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2's contrast ratio, from 1 to 21. */
export function contrast(a: Hex, b: Hex): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];

  return (light + 0.05) / (dark + 0.05);
}

/** `a` moved towards `b` by `amount`, from 0 (all `a`) to 1 (all `b`). */
export function mix(a: Hex, b: Hex, amount: number): Hex {
  const from = channels(a);
  const to = channels(b);

  return toHex(from.map((value, index) => value + ((to[index] ?? value) - value) * amount));
}

/** `#rrggbb` as `r g b`, for `rgb(var(--x) / alpha)`. */
export function rgbChannels(hex: Hex): string {
  return channels(hex).join(' ');
}
