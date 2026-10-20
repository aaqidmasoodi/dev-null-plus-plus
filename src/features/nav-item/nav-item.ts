import { createLogoMark, createWordmark } from '@/core/brand';
import { EXTENSION_NAME } from '@/core/constants';
import { markOwned, ownedSelector } from '@/core/dom';
import { findActiveLink, findLinkTemplate, findMainNav, findSettingsLink } from '@/site/selectors';

export const NAV_ITEM_ROLE = 'nav-item';

/**
 * Classes copied from the site's nav markup, used only if the live markup ever stops having the shape we read classes
 * from. Copying from the live page is preferred, since it follows the site's restyles automatically. Source:
 * resources/js/components/app-nav.tsx.
 */
const FALLBACK_CLASSES = {
  item: 'relative isolate block h-11 rounded-lg py-3 pr-3 pl-4 text-[15px] leading-5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
  activeItem:
    'relative isolate block h-11 rounded-lg py-3 pr-3 pl-4 text-[15px] leading-5 font-medium transition-colors text-primary hover:bg-transparent hover:text-primary',
  highlight: 'absolute inset-0 -z-10 rounded-lg bg-primary-soft',
  content: 'flex items-center gap-3 [view-transition-class:indicator-label]',
  iconWrap: 'relative',
  icon: 'size-5',
  label:
    'max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] nav-wide:max-w-40 nav-wide:opacity-100 motion-reduce:transition-none',
} as const;

export type ItemClasses = Record<keyof typeof FALLBACK_CLASSES, string>;

function classOf(element: Element | null | undefined, fallback: string): string {
  const value = element?.getAttribute('class')?.trim();

  return value === undefined || value === '' ? fallback : value;
}

function withoutClasses(value: string, exclude: (name: string) => boolean): string {
  return value
    .split(/\s+/)
    .filter((name) => name !== '' && !exclude(name))
    .join(' ');
}

/**
 * Reads the classes off real nav links, which are laid out as
 * `a > (span.highlight when current)? > span.content > (span.iconWrap > svg, span.label)`. Any part that is missing
 * falls back on its own.
 *
 * @param template A link that is not the current page.
 * @param active The current page's link, if any, for the highlighted look.
 */
export function readItemClasses(template: HTMLAnchorElement | null, active: HTMLAnchorElement | null): ItemClasses {
  const content = template?.querySelector(':scope > span:not([aria-hidden])');
  const iconWrap = content?.children[0];
  const icon = iconWrap?.querySelector('svg');
  const label = content?.children[1];
  const highlight = active?.querySelector(':scope > span[aria-hidden]');
  // Lucide adds marker classes such as `lucide-settings-2` that would mislabel our icon.
  const iconClass = withoutClasses(
    classOf(icon, FALLBACK_CLASSES.icon),
    (name) => name === 'lucide' || name.startsWith('lucide-'),
  );
  // The highlight carries a view-transition name, which must stay unique on the page.
  const highlightClass = withoutClasses(classOf(highlight, FALLBACK_CLASSES.highlight), (name) =>
    name.includes('view-transition-name'),
  );

  return {
    item: classOf(template, FALLBACK_CLASSES.item),
    activeItem: classOf(active, FALLBACK_CLASSES.activeItem),
    highlight: highlightClass === '' ? FALLBACK_CLASSES.highlight : highlightClass,
    content: classOf(content, FALLBACK_CLASSES.content),
    iconWrap: classOf(iconWrap, FALLBACK_CLASSES.iconWrap),
    icon: iconClass === '' ? FALLBACK_CLASSES.icon : iconClass,
    label: classOf(label, FALLBACK_CLASSES.label),
  };
}

export function buildNavItem(classes: ItemClasses, href: string): HTMLAnchorElement {
  const link = document.createElement('a');

  markOwned(link, NAV_ITEM_ROLE);
  link.href = href;
  link.className = classes.item;
  // The site shows a tooltip on its icons when the nav is collapsed. A native one stands in for ours.
  link.title = EXTENSION_NAME;
  link.setAttribute('aria-label', EXTENSION_NAME);
  link.dataset.test = 'dnpp-nav-item';

  const content = document.createElement('span');

  content.className = classes.content;
  // Each nav item has its own view-transition name. Names must be unique on the page, so never reuse the site's.
  content.style.setProperty('view-transition-name', 'nav-dev-null-plus-plus');

  const iconWrap = document.createElement('span');

  iconWrap.className = classes.iconWrap;
  iconWrap.append(createLogoMark(classes.icon));

  const label = document.createElement('span');

  label.className = classes.label;
  label.append(createWordmark());

  content.append(iconWrap, label);
  link.append(content);

  return link;
}

export interface NavItemOptions {
  /** Where the item links to, the settings page's fragment. */
  href: string;
}

/**
 * Keeps a "/dev/null++" link in the site's left navigation, directly under Settings.
 *
 * The nav belongs to React, which can re-render or remount it on any page change. {@link NavItem.ensure} is called on
 * every DOM change and puts the item back where it belongs if it went missing, moved, or ended up in a fresh nav. It
 * is idempotent and returns early in the common case where nothing changed.
 *
 * It is a plain link to a URL fragment, so the browser handles the click, including opening it in a new tab.
 */
export class NavItem {
  readonly #href: string;
  #element: HTMLAnchorElement | null = null;
  #classes: ItemClasses | null = null;
  #nav: HTMLElement | null = null;
  #anchor: HTMLAnchorElement | null = null;
  #active = false;

  constructor({ href }: NavItemOptions) {
    this.#href = href;
  }

  get element(): HTMLAnchorElement | null {
    return this.#element;
  }

  ensure(): void {
    if (this.#isInPlace()) {
      return;
    }

    const nav = findMainNav();

    if (nav === null) {
      // Not every page has the rail, for example below the md breakpoint. Nothing to do until it shows up.
      return;
    }

    this.#removeStrays(nav);

    const anchor = findSettingsLink(nav);

    if (this.#element === null || nav !== this.#nav) {
      this.#element?.remove();
      this.#classes = readItemClasses(findLinkTemplate(nav), findActiveLink(nav));
      this.#element = buildNavItem(this.#classes, this.#href);
      this.#applyActive();
    }

    this.#nav = nav;
    this.#anchor = anchor;

    if (anchor !== null) {
      anchor.after(this.#element);
    } else {
      // No Settings link to sit under: go just before the first button (Search), which is where the links end.
      const firstButton = [...nav.children].find((child) => child instanceof HTMLButtonElement);

      nav.insertBefore(this.#element, firstButton ?? null);
    }
  }

  /** Highlights the item as the current page, the way the site highlights its own. */
  setActive(active: boolean): void {
    if (active === this.#active) {
      return;
    }

    this.#active = active;
    this.#applyActive();
  }

  destroy(): void {
    this.#element?.remove();
    this.#element = null;
    this.#classes = null;
    this.#nav = null;
    this.#anchor = null;
  }

  #applyActive(): void {
    const element = this.#element;
    const classes = this.#classes;

    if (element === null || classes === null) {
      return;
    }

    element.className = this.#active ? classes.activeItem : classes.item;
    element.querySelector(':scope > span[aria-hidden]')?.remove();

    if (this.#active) {
      const highlight = document.createElement('span');

      highlight.setAttribute('aria-hidden', 'true');
      highlight.className = classes.highlight;
      element.prepend(highlight);
      element.setAttribute('aria-current', 'page');
    } else {
      element.removeAttribute('aria-current');
    }
  }

  #isInPlace(): boolean {
    const element = this.#element;

    if (element === null || !element.isConnected || element.parentElement !== this.#nav) {
      return false;
    }

    if (this.#anchor === null) {
      return true;
    }

    return this.#anchor.isConnected && element.previousElementSibling === this.#anchor;
  }

  /** Removes items left behind by an earlier copy of the extension, such as one running before an update. */
  #removeStrays(nav: HTMLElement): void {
    for (const stray of nav.ownerDocument.querySelectorAll(ownedSelector(NAV_ITEM_ROLE))) {
      if (stray !== this.#element) {
        stray.remove();
      }
    }
  }
}
