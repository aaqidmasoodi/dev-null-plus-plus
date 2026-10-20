# dev/null++

Extra powers for [dev-null.sh](https://dev-null.sh), the social network for developers.

Install it and that is it. dev/null++ adds itself to the site's left navigation, directly under **Settings**, and
everything it does lives there, inside dev-null.sh. There is no popup and no options page. The toolbar icon opens the
same panel, or takes you to dev-null.sh from any other tab.

## Install (development build)

```sh
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick `.output/chrome-mv3`.
3. Open [dev-null.sh](https://dev-null.sh). Tabs that are already open pick the extension up without a reload.

### Working on it

```sh
npm run dev
```

This rebuilds into `.output/chrome-mv3-dev` on every change and reloads the extension. Load that folder once, as above,
in your own Chrome profile, the one where you are signed in to dev-null.sh. WXT's own browser launcher is turned off so
you are never testing in a signed-out profile by accident.

## Scripts

| Script              | What it does                                                                   |
| ------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`       | Watch mode, Chrome                                                             |
| `npm run build`     | Production build into `.output/chrome-mv3`                                     |
| `npm run zip`       | Store-ready zip in `.output/`                                                  |
| `npm run check`     | Type-check, lint, format check and unit tests. CI runs this.                   |
| `npm test`          | Unit tests (Vitest, happy-dom)                                                 |
| `npm run test:e2e`  | Builds, then runs the extension in Chromium against the live site (Playwright) |
| `npm run *:firefox` | Firefox variants of `dev`, `build` and `zip`                                   |

The first e2e run needs a browser: `npx playwright install chromium`.

## How it works

```
src/
  entrypoints/
    background.ts               Toolbar icon, and injecting into tabs already open on install or update
    devnull.content.ts          The content script: waits for hydration, then mounts the features
    hydration-probe.content.ts  Main-world script that reports when React has finished hydrating
  core/                         Shared, site-agnostic pieces: constants, logger, DOM helpers, messages
  site/selectors.ts             Every assumption about dev-null.sh's markup, in one place
  features/
    nav-item/                   The "dev/null++" entry in the left navigation
    panel/                      The panel it opens
```

A few rules keep this working while dev-null.sh deploys many times a day.

- **One file knows the site's markup.** `src/site/selectors.ts` holds every selector. They use the structural and test
  attributes the site itself relies on (`data-nav-rail`, `aria-label`, `aria-current`, `data-test`), never its
  generated Tailwind classes. When the site changes, that file and the e2e suite are where to look.
- **Look native by borrowing, not copying.** The nav item reads its classes off a real nav link at runtime, so it
  follows the site's restyles. It only falls back to a hard-coded copy if the markup changes shape.
- **Never fight React.** The page is server-rendered and then hydrated. Adding a node to it before hydration finishes
  makes React throw the page away and render it again. `hydration-probe.content.ts` runs in the page's main world,
  where React's bookkeeping is visible, and tells the content script when hydration has committed. After that, a
  `MutationObserver` puts the nav item back whenever React re-renders or remounts the navigation.
- **Our UI stays out of the site's way.** The panel is a native `<dialog>` in a closed shadow root attached to `<body>`,
  outside the React root. It reads the site's theme tokens (`--background`, `--primary` and so on), which inherit into
  the shadow root, so it matches light and dark mode automatically. Key presses inside it never reach the site's
  single-key shortcuts.
- **Clean up.** Everything the extension adds carries a `data-dnpp` attribute. On update the old copy removes its
  nodes and the new one removes any it left behind.

## Permissions

- `https://dev-null.sh/*`: to run on dev-null.sh, and nowhere else.
- `scripting`: to start in tabs that were already open when the extension was installed or updated.

## Release

`npm run zip` produces the Chrome Web Store upload in `.output/`. Bump `version` in `package.json` first. The manifest
version is read from it.
