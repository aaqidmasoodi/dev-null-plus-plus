/**
 * The /dev/null logo, rebuilt from the site's own components so dev/null++ reads as part of it. Sources:
 * resources/js/components/app-logo-icon.tsx and app-wordmark.tsx.
 *
 * The accent is the site's `--lane-0` token (orange, lighter in dark mode), with its light-mode value as a fallback.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ACCENT = 'var(--lane-0, #d9480f)';

/** The two-slash mark: a solid slash in the text color and an outlined one in the accent. */
export function createLogoMark(className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');

  svg.setAttribute('xmlns', SVG_NAMESPACE);
  svg.setAttribute('viewBox', '1.6 1.5 45 45');
  svg.setAttribute('aria-hidden', 'true');

  if (className !== '') {
    svg.setAttribute('class', className);
  }

  const solid = document.createElementNS(SVG_NAMESPACE, 'path');

  solid.setAttribute('d', 'M2 42h10L26 6H16Z');
  solid.setAttribute('fill', 'currentColor');

  const outlined = document.createElementNS(SVG_NAMESPACE, 'path');

  outlined.setAttribute('fill-rule', 'evenodd');
  outlined.setAttribute('clip-rule', 'evenodd');
  outlined.setAttribute('d', 'M17.81 43.5h13.22L46.19 4.5H32.97ZM22.19 40.5l12.84-33h6.78l-12.84 33Z');
  outlined.style.fill = ACCENT;

  svg.append(solid, outlined);

  return svg;
}

/** "/dev/null++", with the second slash outlined in the accent like the site's wordmark. */
export function createWordmark(): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const slash = document.createElement('span');

  slash.textContent = '/';
  slash.style.color = 'transparent';
  slash.style.setProperty('-webkit-text-stroke', `max(1px, 0.035em) ${ACCENT}`);
  fragment.append('/dev', slash, 'null++');

  return fragment;
}
