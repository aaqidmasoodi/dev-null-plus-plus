import { OWNED_ATTRIBUTE } from './constants';

/**
 * Calls `callback` whenever the page's DOM changes, until `signal` aborts.
 *
 * dev-null.sh is a single-page app: Inertia swaps pages without a reload, and React can remount the parts we attach to
 * at any time. Features use this to notice and put themselves back. The callback runs once per batch of mutations, so
 * it has to be cheap and idempotent.
 */
export function observeDom(callback: () => void, signal: AbortSignal, target: Node = document.body): void {
  if (signal.aborted) {
    return;
  }

  const observer = new MutationObserver(callback);

  observer.observe(target, { childList: true, subtree: true });
  signal.addEventListener(
    'abort',
    () => {
      observer.disconnect();
    },
    { once: true },
  );
}

/** Calls `callback` whenever one of `attributes` changes on `target`, until `signal` aborts. */
export function observeAttributes(
  target: Element,
  attributes: readonly string[],
  callback: () => void,
  signal: AbortSignal,
): void {
  if (signal.aborted) {
    return;
  }

  const observer = new MutationObserver(callback);

  observer.observe(target, { attributes: true, attributeFilter: [...attributes] });
  signal.addEventListener(
    'abort',
    () => {
      observer.disconnect();
    },
    { once: true },
  );
}

/** Marks an element as ours. See {@link OWNED_ATTRIBUTE}. */
export function markOwned(element: Element, role: string): void {
  element.setAttribute(OWNED_ATTRIBUTE, role);
}

export function ownedSelector(role: string): string {
  return `[${OWNED_ATTRIBUTE}="${role}"]`;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Builds an inline SVG icon from path data. Built with DOM calls, never `innerHTML`, so nothing is ever parsed as markup
 * inside the site's page.
 */
export function createSvgIcon(paths: readonly string[], className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');

  svg.setAttribute('xmlns', SVG_NAMESPACE);
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  if (className !== '') {
    svg.setAttribute('class', className);
  }

  for (const d of paths) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');

    path.setAttribute('d', d);
    svg.append(path);
  }

  return svg;
}
