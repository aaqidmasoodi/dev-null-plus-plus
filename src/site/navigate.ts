/**
 * Follows one of the site's own links the way a click would, so Inertia handles it: the page swaps in place with the
 * site's own transitions, instead of reloading.
 *
 * Inertia's links take any left click without modifier keys, trusted or not. If nothing handles the click, this stops
 * the browser following it as an ordinary link and returns `false`, so the caller can do something else.
 *
 * @returns Whether the site took the navigation.
 */
export function followSiteLink(link: HTMLAnchorElement): boolean {
  let handled = false;
  // React, and so Inertia, listens on the app root. By the time the click bubbles up to the document, it has had its say.
  const check = (event: Event): void => {
    handled = event.defaultPrevented;

    if (!handled) {
      event.preventDefault();
    }
  };

  document.addEventListener('click', check, { once: true });
  link.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, view: window }),
  );
  document.removeEventListener('click', check);

  return handled;
}

/** A plain left click, the kind that should open a link in place rather than in a new tab or window. */
export function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}
