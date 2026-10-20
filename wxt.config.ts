import { defineConfig } from 'wxt';

import { DEV_SERVER, extensionPagesCsp, SITE_HOST_PERMISSION, SITE_ORIGIN } from './src/core/constants';

export default defineConfig({
  srcDir: 'src',
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
    permissions: ['scripting'],
    host_permissions: [SITE_HOST_PERMISSION],
    content_security_policy: {
      extension_pages: extensionPagesCsp(command === 'serve' ? { devServer: DEV_SERVER } : {}),
    },
    // No other extension and no web page may message us. Firefox does not support the key.
    externally_connectable: browser === 'firefox' ? undefined : { ids: [] },
    browser_specific_settings:
      browser === 'firefox'
        ? { gecko: { id: 'dev-null-plus-plus@aaqidmasoodi', strict_min_version: '128.0' } }
        : undefined,
  }),
  webExt: {
    // `npm run dev` rebuilds into .output/chrome-mv3-dev. Load that folder once in your own Chrome profile (where you
    // are signed in to dev-null.sh); WXT reloads the extension on every change.
    disabled: true,
  },
});
