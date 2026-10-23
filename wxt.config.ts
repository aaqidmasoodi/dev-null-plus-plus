import { defineConfig } from 'wxt';

import { DATA_COLLECTION } from './src/core/consent';
import {
  DEV_SERVER,
  extensionPagesCsp,
  OPTIONAL_HOST_PERMISSIONS,
  SITE_HOST_PERMISSION,
  SITE_ORIGIN,
  VAULT_PAGE,
} from './src/core/constants';

export default defineConfig({
  srcDir: 'src',
  // Manifest V3 everywhere, Firefox included, so both browsers get the same permissions model and policies.
  manifestVersion: 3,
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
  },
  manifest: ({ browser, command }) => ({
    name: '/dev/null++',
    description: 'Extra powers for dev-null.sh, the social network for developers.',
    homepage_url: SITE_ORIGIN,
    minimum_chrome_version: browser === 'chrome' ? '120' : undefined,
    // Clicking the toolbar icon opens the dev/null++ panel, so there is deliberately no popup.
    action: {
      default_title: '/dev/null++',
    },
    // Least privilege: only what is needed, and only on dev-null.sh. The e2e suite fails if this list grows.
    // `webNavigation` tells a link preview that its page refused to be shown; it is only read for frames on dev-null.sh.
    permissions: ['scripting', 'storage', 'webNavigation'],
    host_permissions: [SITE_HOST_PERMISSION],
    optional_host_permissions: OPTIONAL_HOST_PERMISSIONS,
    // Only the key-entry page, only to dev-null.sh, and under a per-session URL so sites cannot probe for the extension.
    web_accessible_resources: [{ resources: [VAULT_PAGE], matches: [SITE_HOST_PERMISSION], use_dynamic_url: true }],
    content_security_policy: {
      extension_pages: extensionPagesCsp(command === 'serve' ? { devServer: DEV_SERVER } : {}),
    },
    // No other extension and no web page may message us. Firefox does not support the key.
    externally_connectable: browser === 'firefox' ? undefined : { ids: [] },
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: 'dev-null-plus-plus@aaqidmasoodi',
              // 140 is the current Extended Support Release, and the first with built-in data consent.
              strict_min_version: '140.0',
              // Nothing is sent anywhere by itself. A draft goes to your AI provider only when you ask for a rewrite,
              // so that is optional, and asked for when you connect a provider (src/core/consent.ts).
              data_collection_permissions: { required: ['none'], optional: [...DATA_COLLECTION] },
            },
            // Firefox for Android has built-in data consent from 142.
            gecko_android: { strict_min_version: '142.0' },
          }
        : undefined,
  }),
  webExt: {
    // `npm run dev` rebuilds into .output/chrome-mv3-dev. Load that folder once in your own Chrome profile (where you
    // are signed in to dev-null.sh); WXT reloads the extension on every change.
    disabled: true,
  },
  zip: {
    // The sources zip is for Firefox's reviewers to rebuild the extension. The README's animations and local test
    // output play no part in that, and were most of its size.
    excludeSources: ['docs/media/**', 'test-results/**', 'playwright-report/**'],
  },
});
