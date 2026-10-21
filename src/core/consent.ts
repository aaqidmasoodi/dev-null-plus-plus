/**
 * Firefox asks people, as they install an extension or later, whether it may send their data anywhere, and has them
 * allow each kind (https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). dev/null++
 * sends nothing by itself; the one thing it ever sends is a draft you ask the AI to rewrite, to the provider you
 * connected. So it declares no data collection by default, and asks for "website content" only when you connect a
 * provider. Chrome has no such consent, and there everything here allows.
 */

/** What a rewrite sends: the text of your draft on dev-null.sh. */
export const DATA_COLLECTION = ['websiteContent'] as const;

/** The permissions API with Firefox's data consent in it, which the shared types do not include yet. */
type ConsentPermissions = Browser.permissions.Permissions & { data_collection?: string[] };

/** Firefox has it from 140, the oldest the extension supports there (wxt.config.ts); Chrome does not. */
export function hasDataConsentApi(): boolean {
  return import.meta.env.FIREFOX;
}

/**
 * What to add to a permission request for the consent, if this browser asks for it. Part of the same request, since
 * a request only works straight away in a click, and the click can only be used for one.
 */
export function dataConsentRequest(): ConsentPermissions {
  return hasDataConsentApi() ? { data_collection: [...DATA_COLLECTION] } : {};
}

/** Whether a draft may be sent to the provider: always outside Firefox, and in Firefox only once allowed. */
export async function hasDataConsent(): Promise<boolean> {
  if (!hasDataConsentApi()) {
    return true;
  }

  const request: ConsentPermissions = { data_collection: [...DATA_COLLECTION] };

  return browser.permissions.contains(request);
}
