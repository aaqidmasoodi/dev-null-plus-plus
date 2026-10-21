import { isTopLevelSitePage, SITE_MATCHES } from '@/core/constants';
import { readSettings } from '@/core/settings';
import { WHO_TO_FOLLOW_CARDS_ATTRIBUTE } from '@/site/who-to-follow';

import './skeleton.css';

/**
 * Runs before the page is drawn, with the skeleton style above, so "Who to follow" shows the cards' skeleton from the
 * first frame instead of the site's rows. It only marks <html> when the cards are on, which React does not render, so
 * it never touches the page before React has taken it over. The main content script keeps the mark in step with the
 * setting after that.
 */
export default defineContentScript({
  matches: SITE_MATCHES,
  runAt: 'document_start',
  // Listed in the manifest, so the browser applies the style before the first paint.
  cssInjectionMode: 'manifest',
  async main() {
    if (!isTopLevelSitePage()) {
      return;
    }

    const { features } = await readSettings();

    document.documentElement.toggleAttribute(WHO_TO_FOLLOW_CARDS_ATTRIBUTE, features.whoToFollowCards);
  },
});
