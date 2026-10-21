# dev/null++

Extra powers for [dev-null.sh](https://dev-null.sh), the social network for developers.

Install it and that is it. dev/null++ adds **/dev/null++** to the site's left navigation, directly under **Settings**.
It opens a settings page inside dev-null.sh, at `#dev-null-plus-plus` on whatever page you are on. There is no popup
and no options page. The toolbar icon opens the same page.

The first time you open the site after installing, a short tour shows what it adds. It opens once, and **Show the
welcome again** on the settings page brings it back.

## Features

Every feature can be switched off on the settings page.

- **Rewrite with AI.** Connect Groq, OpenAI, Anthropic, xAI or Google Gemini with your own API key, and the composer
  gets an AI button next to its other tools. It opens a small panel to Improve, Shorten, Fix grammar, or make a draft
  more Casual or Professional, with Undo. Your key stays in this browser and is only sent to the provider you chose.
- **Load new commits automatically.** When the log's "N new commits" pill appears, they load on their own, with a
  short animation, exactly as if you had clicked it. Only while you are at the top of the log: further down, nothing
  moves, and they load as soon as you scroll back up.
- **Link preview.** Press and hold a link to someone's project and it grows out of the link into a large window over
  the log, with phone, tablet and desktop widths and resizable edges. Let go early and it shrinks back. It opens like a
  private window: none of your cookies or logins. Sites known to refuse being shown inside another page, like GitHub
  or X, stay plain links. A normal click is unchanged.
- **Image peek.** Press and hold any image, such as one of a commit's photos, and it grows out of the page to fill
  the screen. Let go and it goes back exactly where it was. A normal click still opens the site's photo viewer. Avatars
  can be peeked at on their own profile and in your composer, sharp at full size; elsewhere hovering them shows the
  site's card about the person, as before.
- **Picture-in-picture.** Keep a video playing while you scroll and browse. Scroll past a playing video and it floats
  to a corner; scroll back and it returns to its post. Pop it out with the button under the video and it stays out on
  every page until you play it here or close it. Drag it to any corner and resize it from its corners. Works for every
  video provider the site plays.

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
  features/
    nav-item/                   The "/dev/null++" link in the left navigation
    settings-page/              The settings page it opens, built from sections
    ai-rewrite/                 The composer's AI button and panel, and its settings section
    auto-load/                  Loading new commits when the log's pill appears
    link-preview/               Press and hold a link to preview it in a private window
    image-peek/                 Press and hold an image to see it big
    pip/                        Picture-in-picture for videos
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

## Security

The extension is built security-first. [SECURITY.md](SECURITY.md) has the threat model and the rules every feature
follows.

## Permissions

- `https://dev-null.sh/*`: to run on dev-null.sh, and nowhere else.
- `scripting`: to start in tabs that were already open when the extension was installed or updated.
- `storage`: to remember your settings and which AI provider is connected (never the key itself).
- `webNavigation`: to know when a link preview's page refuses to be shown, so it can say so plainly. Chrome lists it
  as "Read your browsing history"; it is only ever read for frames inside dev-null.sh, and nothing is kept.
- `https://api.groq.com/*`, optional: asked for only when you connect Groq, whose API does not otherwise allow
  extensions to call it, and given back when you disconnect.

## Logo

The dev/null++ logo is © Aaqid Masoodi, all rights reserved, and is not covered by the MIT licence of the code. It may
not be used outside dev/null++ without permission. See [LOGO.md](LOGO.md).

## Release

`npm run zip` produces the Chrome Web Store upload in `.output/`. Bump `version` in `package.json` first. The manifest
version is read from it.
