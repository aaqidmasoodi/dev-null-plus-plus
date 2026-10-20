import { createLogoMark, createWordmark } from '@/core/brand';
import { EXTENSION_NAME } from '@/core/constants';
import { markOwned, ownedSelector } from '@/core/dom';
import { findLinkTemplate, findMainNav, findSettingsLink } from '@/site/selectors';

export const NAV_ITEM_ROLE = 'nav-item';

/**
 * Classes copied from the site's nav markup, used only if the live markup ever stops having the shape we read classes
 * from. Copying from the live page is preferred, since it follows the site's restyles automatically. Source:
 * resources/js/components/app-nav.tsx.
 */
const FALLBACK_CLASSES = {
  item: 'relative isolate block h-11 rounded-lg py-3 pr-3 pl-4 text-[15px] leading-5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
  content: 'flex items-center gap-3 [view-transition-class:indicator-label]',
  iconWrap: 'relative',
  icon: 'size-5',
  label:
    'max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] nav-wide:max-w-40 nav-wide:opacity-100 motion-reduce:transition-none',
} as const;

type ItemClasses = Record<keyof typeof FALLBACK_CLASSES, string>;

/**
 * Reads the classes off a real nav link, which is laid out as `a > span.content > (span.iconWrap > svg, span.label)`.
 * Any part that is missing falls back on its own.
 */
export function readItemClasses(template: HTMLAnchorElement | null): ItemClasses {
  const content = template?.firstElementChild;
  const iconWrap = content?.children[0];
  const icon = iconWrap?.querySelector('svg');
  const label = content?.children[1];
  const classOf = (element: Element | null | undefined, fallback: string): string => {
    const value = element?.getAttribute('class')?.trim();

    return value === undefined || value === '' ? fallback : value;
  };
  // Lucide adds marker classes such as `lucide-settings-2` that would mislabel our icon.
  const iconClass = classOf(icon, FALLBACK_CLASSES.icon)
    .split(/\s+/)
    .filter((name) => name !== 'lucide' && !name.startsWith('lucide-'))
    .join(' ');

  return {
    item: classOf(template, FALLBACK_CLASSES.item),
    content: classOf(content, FALLBACK_CLASSES.content),
    iconWrap: classOf(iconWrap, FALLBACK_CLASSES.iconWrap),
    icon: iconClass === '' ? FALLBACK_CLASSES.icon : iconClass,
    label: classOf(label, FALLBACK_CLASSES.label),
  };
}

export function buildNavItem(classes: ItemClasses): HTMLButtonElement {
  const button = document.createElement('button');

  markOwned(button, NAV_ITEM_ROLE);
  button.type = 'button';
  button.className = classes.item;
  button.title = `${EXTENSION_NAME} settings`;
  button.dataset.test = 'dnpp-nav-item';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  // The site's links are block-level anchors; a button needs these to fill the row and line up the same way.
  button.style.width = '100%';
  button.style.textAlign = 'left';

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
  button.append(content);

  return button;
}

export interface NavItemOptions {
  onActivate: () => void;
}

/**
 * Keeps a "dev/null++" item in the site's left navigation, directly under Settings.
 *
 * The nav belongs to React, which can re-render or remount it on any page change. {@link NavItem.ensure} is called on
 * every DOM change and puts the item back where it belongs if it went missing, moved, or ended up in a fresh nav. It
 * is idempotent and returns early in the common case where nothing changed.
 */
export class NavItem {
  readonly #onActivate: () => void;
  #element: HTMLButtonElement | null = null;
  #nav: HTMLElement | null = null;
  #anchor: HTMLAnchorElement | null = null;
  #expanded = false;

  constructor({ onActivate }: NavItemOptions) {
    this.#onActivate = onActivate;
  }

  get element(): HTMLButtonElement | null {
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
      this.#element = this.#create(nav);
    }

    this.#nav = nav;
    this.#anchor = anchor;

    if (anchor !== null) {
      anchor.after(this.#element);
    } else {
      // No Settings link to sit under: go just before the first button (Search), which is where the links end.
      const firstButton = [...nav.children].find(
        (child) => child instanceof HTMLButtonElement && child !== this.#element,
      );

      nav.insertBefore(this.#element, firstButton ?? null);
    }
  }

  setExpanded(expanded: boolean): void {
    this.#expanded = expanded;
    this.#element?.setAttribute('aria-expanded', String(expanded));
  }

  destroy(): void {
    this.#element?.remove();
    this.#element = null;
    this.#nav = null;
    this.#anchor = null;
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

  #create(nav: HTMLElement): HTMLButtonElement {
    const button = buildNavItem(readItemClasses(findLinkTemplate(nav)));

    button.setAttribute('aria-expanded', String(this.#expanded));
    button.addEventListener('click', (event) => {
      event.preventDefault();
      this.#onActivate();
    });

    return button;
  }
}
