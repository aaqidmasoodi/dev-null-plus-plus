# Development

How to build, test and release dev/null++, and how it is put together. For what it does, see the [README](../README.md).

## Build

```sh
npm install
npm run build          # Chrome: load .output/chrome-mv3 as an unpacked extension
npm run build:firefox  # Firefox: load .output/firefox-mv3/manifest.json as a temporary add-on
```

## Work on it

```sh
npm run dev
```

This rebuilds into `.output/chrome-mv3-dev` on every change and reloads the extension. Load that folder once, as above,
in your own Chrome profile, the one where you are signed in to dev-null.sh. WXT's own browser launcher is turned off so
you are never testing in a signed-out profile by accident.

## Scripts

| Script                     | What it does                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run dev`              | Watch mode, Chrome                                                                       |
| `npm run build`            | Production build into `.output/chrome-mv3`                                               |
| `npm run zip`              | Store-ready zip in `.output/`                                                            |
| `npm run check`            | Type-check, lint, format check and unit tests. CI runs this.                             |
| `npm test`                 | Unit tests (Vitest, happy-dom)                                                           |
| `npm run test:e2e`         | Builds, then runs the extension in Chromium against the live site (Playwright)           |
| `npm run test:e2e:firefox` | Builds, then checks the extension starts and its pages work in a real Firefox (Selenium) |
| `npm run media`            | Redraws the README's pictures into `docs/media` (see below)                              |
| `npm run *:firefox`        | Firefox variants of `dev`, `build` and `zip`                                             |

The first e2e run needs a browser: `npx playwright install chromium`.

## The pictures

The welcome tour and the README show each feature as a short loop, drawn with the same pieces as the site's own
interface (`src/features/welcome/motion`). They are code, not video: each scene is a timeline written in milliseconds,
run on the Web Animations API, so the tour is sharp at any size and follows the site's light and dark mode.

`npm run media` loads every scene on a page of its own (`scripts/media`), steps through it one exact frame at a time in
headless Chromium, and writes an animated WebP for each scene and theme into `docs/media`. It needs
`npx playwright install chromium` and libwebp's `img2webp` (`brew install webp`, or `apt install webp`).

```sh
npm run media                              # everything
npm run media -- rewrite pip --theme dark  # just these
npm run media -- rewrite --stills 2000,5000        # PNGs of those moments in .output/stills, to look at
npm run media -- rewrite --measure .preset --at 0  # where pieces are on the 512 by 288 stage, to aim the cursor
```

Change a scene in `src/features/welcome/motion/scenes`, then run `npm run media` and commit the new pictures.

`npm run media:themes` redraws `docs/media/themes-*.webp`: each theme on the live site, with every person and post swapped for made-up ones. Run `npm run build` first.

## How it works

```
src/
  entrypoints/
    background.ts               Toolbar icon, injecting into open tabs, and handling rewrite requests
    vault/                      The key-entry page, framed into the settings page
    devnull.content.ts          The content script: waits for hydration, then mounts the features
    hydration-probe.content.ts  Main-world script that reports when React has finished hydrating
  background/                   Extension-origin only: the key vault, AI providers, the rewrite prompt
  core/                         Shared, site-agnostic pieces: constants, logger, DOM helpers, route, settings, branding
  site/
    selectors.ts                Every assumption about dev-null.sh's markup, in one place
    takeover.ts                 Hides the site's page while ours shows
    composer.ts                 Finding the composers and writing into them
    log.ts                      The log's new-commits pill and feed
    links.ts                    Which links can be previewed
    images.ts                   Which images can be peeked at
    embeds.ts                   Video embeds, and the bars along the screen's edges
    who-to-follow.ts            The people Who to follow suggests
  features/
    nav-item/                   The "/dev/null++" link in the left navigation
    settings-page/              The settings page it opens, built from sections
    ai-rewrite/                 The composer's AI button and panel, and its settings section
    auto-load/                  Loading new commits when the log's pill appears
    link-preview/               Press and hold a link to preview it in a private window
    image-peek/                 Press and hold an image to see it big
    pip/                        Picture-in-picture for videos
    who-to-follow/              Who to follow as swipeable cards
    welcome/                    The tour shown the first time the site opens
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
- **Routes are URL fragments.** The settings page lives at `#dev-null-plus-plus`, so reloading, sharing, Back and
  Forward all work. A made-up path would 404 when reloaded and when Inertia polls `router.reload()`, which requests the
  current URL. Inertia keeps fragments on the URL across its visits and polls.
- **Our pages replace the site's, they don't remove it.** The settings page sits in the middle column, and the site's
  page is hidden with CSS while it shows, so React keeps its state and Back is instant. It holds the tab title while
  open and gives the site's back after.
- **Our UI stays out of the site's styles.** The settings page renders in a shadow root and reads the site's theme
  tokens (`--card`, `--border`, `--muted-foreground` and so on), which inherit into it, so it matches light and dark
  mode automatically.
- **Clean up.** Everything the extension adds carries a `data-dnpp` attribute. On update the old copy removes its
  nodes and the new one removes any it left behind.

## Permissions

- `https://dev-null.sh/*`: to run on dev-null.sh, and nowhere else.
- `scripting`: to start in tabs that were already open when the extension was installed or updated.
- `storage`: to remember your settings and which AI provider is connected (never the key itself).
- `webNavigation`: to know when a link preview's page refuses to be shown, so it can say so plainly. Chrome lists it
  as "Read your browsing history"; it is only ever read for frames inside dev-null.sh, and nothing is kept.
- `https://api.groq.com/*`, optional: asked for only when you connect Groq, whose API does not otherwise allow
  extensions to call it, and given back when you disconnect.
- Firefox only, optional: leave to send "website content", asked for when you connect an AI provider, since your draft
  is sent to it when you ask for a rewrite. Nothing else is ever sent, and it is given back when you disconnect.

## Release

Bump `version` in `package.json` first; the manifest version is read from it. Then publish a GitHub release. The release
workflow builds both browsers and attaches the Chrome zip and the Firefox build to it. With an addons.mozilla.org API
key in the repository secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`, Mozilla signs the Firefox build so it installs in
any Firefox; without one, the unsigned build is attached for debugging mode.

`npm run zip` and `npm run zip:firefox` produce the same uploads locally, in `.output/`.
