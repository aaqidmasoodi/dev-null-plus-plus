/**
 * dev/null++'s marks, built on the /dev/null logo so they read as part of the site. Sources:
 * resources/js/components/app-logo-icon.tsx and app-wordmark.tsx.
 *
 * The accent is the site's `--lane-0` token (orange, lighter in dark mode), with its light-mode value as a fallback.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ACCENT = 'var(--lane-0, #d9480f)';

/**
 * The dev/null++ mark: the site's two slashes, each with an arm reaching out so together they read as "++". A solid
 * slash in the text color and an outlined one in the accent, as on the site. The same shape as the extension's icon
 * (src/assets/icon.svg), in its own square box.
 *
 * © 2026 Aaqid Masoodi. All rights reserved. This mark is not covered by the MIT licence of the code and may not be
 * used outside dev/null++ without permission. See LOGO.md.
 */
export function createLogoMark(className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');

  svg.setAttribute('xmlns', SVG_NAMESPACE);
  svg.setAttribute('viewBox', '0 0 313.3 313.3');
  svg.setAttribute('aria-hidden', 'true');

  if (className !== '') {
    svg.setAttribute('class', className);
  }

  const solid = document.createElementNS(SVG_NAMESPACE, 'path');

  solid.setAttribute('d', 'M183.3 54.7L123.3 54.7L95.3 126.7L23.3 126.7L0 186.7L72 186.7L44 258.7L104 258.7Z');
  solid.setAttribute('fill', 'currentColor');

  const outlined = document.createElementNS(SVG_NAMESPACE, 'path');

  outlined.setAttribute('fill-rule', 'evenodd');
  outlined.setAttribute('clip-rule', 'evenodd');
  outlined.setAttribute(
    'd',
    'M209.3 54.7L269.3 54.7L241.3 126.7L313.3 126.7L290 186.7L218 186.7L190 258.7L130 258.7Z' +
      'M219.7 71.7L245.7 71.7L217.7 143.7L289.7 143.7L279.6 169.7L207.6 169.7L179.6 241.7L153.6 241.7Z',
  );
  outlined.style.fill = ACCENT;

  svg.append(solid, outlined);

  return svg;
}

/**
 * "/dev/null++", with the second slash outlined in the accent like the site's wordmark.
 *
 * Browsers compute the accessible name around the styled slash as "/dev / null++", so whatever contains the wordmark
 * should carry `aria-label` with the plain name.
 */
export function createWordmark(): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const slash = document.createElement('span');

  slash.textContent = '/';
  slash.style.color = 'transparent';
  slash.style.setProperty('-webkit-text-stroke', `max(1px, 0.035em) ${ACCENT}`);
  fragment.append('/dev', slash, 'null++');

  return fragment;
}
