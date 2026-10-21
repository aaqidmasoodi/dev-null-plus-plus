# Security

dev/null++ runs inside your signed-in dev-null.sh session, so it is built to be safe first and fast second. Every
feature follows the rules below. If a rule makes something slower or more work, the rule wins.

## Reporting a vulnerability

Please report it privately through
[GitHub security advisories](https://github.com/aaqidmasoodi/dev-null-plus-plus/security/advisories/new), not in a
public issue.

## Threat model

The extension has three parts, trusted in this order:

1. **The extension's own origin**: the background service worker and the key-entry page. Trusted. It is the only part
   that holds secrets, such as API keys, and the only part that makes network requests.
2. **The content scripts** on dev-null.sh. Partly trusted. They share the page's process, so a compromised page could
   reach them. They never hold secrets.
3. **The page itself**: dev-null.sh's DOM, its scripts, its storage, and the main-world probe. Untrusted. Anything read
   from it, including attributes our own probe sets and events like `inertia:navigate`, can be forged by the page. It
   may only ever trigger harmless, idempotent work.

## Rules

**Permissions**

- Ask for the least: `scripting`, `storage`, `webNavigation` and `https://dev-null.sh/*`. Access to Groq's API is optional and
  only requested, with your click, when you choose Groq, because it is the one provider that does not answer browser
  CORS. It is given back when you disconnect. The e2e suite fails if any of this grows, so adding to it is deliberate.
- Content scripts run on dev-null.sh only, top frame only, and check that again at start-up.
- The only page exposed to the web is the key-entry page (`vault.html`), only to dev-null.sh, behind a per-session URL
  so other sites cannot detect the extension. `externally_connectable` admits no other extension and no web page.

**Code and markup**

- No HTML strings, ever: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `srcdoc` and `document.write` are banned by
  lint. Build nodes with `createElement` and set text with `textContent`.
- No `eval` or `new Function`. The extension CSP forbids them and lint bans them.
- The extension's own pages run under a deny-everything CSP with Trusted Types (`EXTENSION_PAGES_CSP` in
  `src/core/constants.ts`). Network access is limited to the AI providers' exact API origins, and only dev-null.sh may
  frame our pages.

**Messages**

- Every message is checked for both its shape and its sender (`src/core/messages.ts`). Content scripts accept only our
  own background. The background accepts only our content script in the top frame of a dev-null.sh tab. Unknown fields
  are rejected, not ignored.
- No `postMessage` channels with the page. The one exchange with a frame is picture-in-picture asking a video
  provider (YouTube, Vimeo) whether it is playing: only with our own player's frame, only to and from that provider's
  exact origin, reading a single field of what comes back (`src/features/pip/playback.ts`).

**Secrets and data**

- API keys live in the vault: IndexedDB in the extension's own origin (`src/background/vault.ts`). Only the background
  and the key-entry page can open it. dev-null.sh cannot, and neither can our content scripts, which share the page's
  origin. That is a stronger boundary than `browser.storage`, which content scripts can read.
- Content scripts only ever see which provider and model are connected, mirrored to `browser.storage.local`. Never the
  key. It is never put in the DOM, in page storage (`localStorage` and friends are banned), in URLs or in logs.
- Content scripts never make network requests and never import background code. They ask the background, which reads
  the key and makes the request. Lint enforces both.
- The key is typed into the key-entry page, an extension page framed into the settings page, never into an element on
  dev-null.sh. The site's scripts cannot read a cross-origin frame; they could read any shadow root on the page.
- Requests to providers omit credentials, refuse redirects and time out after 30 seconds. Rewrites are rate-limited in
  the background, so nothing on the page can run up your bill. Provider errors become fixed codes and never carry the
  key or the provider's raw reply.
- The model must answer in a fixed JSON shape (structured output where the provider supports it), and anything else
  is discarded, so no commentary or stray text from the model ever reaches the composer. Only the rewrite itself goes
  in, as plain text, through the same path as typing, and is never submitted for you. Every message the panel shows is
  the extension's own. Your draft is fenced in the prompt so text in it cannot pose as instructions.
- The logger redacts anything shaped like an API key or bearer token, and drops stacks.
- Only what a feature needs leaves the browser, only to the provider you configured, and only when you act.

**Link previews**

- A previewed page loads in a `credentialless` frame: none of your cookies or logins for that site, and empty storage
  that is thrown away when the preview closes. The e2e suite signs in to the previewed site and checks that the page
  sees nothing.
- The frame is sandboxed without top navigation, modals or downloads, sends no referrer and is granted no powerful
  features (`allow=""`). The page is a different origin from dev-null.sh, so it cannot reach the log behind it.
- A site's refusal to be framed is respected, never removed. Sites known to refuse are not offered a preview at all
  (`FRAME_REFUSING_SITES` in `src/site/links.ts`). Any other refusal is reported by `webNavigation` and shown as a
  plain notice with a link to open the page in a new tab.
- `webNavigation` is only acted on for errors in frames placed directly in a dev-null.sh page
  (`src/background/frame-failures.ts`). Events from every other site are dropped without being stored or sent
  anywhere. The tab is told only the failed page's address and why, and only shows a notice if that is the page its
  preview is showing.

**Firefox**

- The same code and the same rules. Firefox builds use Manifest V3 too, checked by Mozilla's own linter in CI and
  started in a real Firefox there.
- Firefox asks before an add-on sends data anywhere. dev/null++ declares that it sends nothing, and asks for "website
  content" only when you connect an AI provider, since a draft goes to it when you ask for a rewrite. Taken back in
  Firefox's settings, no draft is sent again, and the composer says why (`src/core/consent.ts`).
- Firefox lets you take back the extension's access to dev-null.sh at any time. Then nothing runs there; the toolbar
  icon shows a badge, and clicking it asks for access again.
- Firefox has no `credentialless` frames. A link preview there relies on Total Cookie Protection, on in every Firefox
  since 103: the previewed site gets its own cookie jar, kept apart from your logins on it, but kept between previews
  rather than thrown away.
- The key-entry page's address is unique to each installation in Firefox, so sites cannot probe for it there either.
- `web-ext`, which lints and signs the Firefox build, is not a dependency: it brings in Android tooling with a known
  advisory. CI and the release workflow run a pinned version of it, and it is never shipped.

**Picture-in-picture**

- Our player plays exactly the frame the site would have: the same address and the same `allow`, `sandbox` and
  referrer policy, read from the site's frame when play is pressed, and only for `https:` addresses. YouTube is also
  asked to report its state, to dev-null.sh only.
- The site's own frame for that video is emptied before it loads, so the video never plays twice. That is the one
  attribute the extension changes on an element the site renders, and React never sets it again.
- Videos in chats, dialogs and other panels are left to the site.

**Image peeks**

- A peek is a copy of a picture already on the page, drawn from the same address in our own overlay. It sends nothing
  anywhere. The one thing it loads is a GitHub avatar at the size the peek shows it: the same address on GitHub's
  avatar host that the site already loads it from, with only its size changed, and no referrer
  (`largerAvatar` in `src/site/images.ts`).
- The site's own picture is hidden only by an animation while the copy is out, and never changed, so React's markup
  is never touched.

**Features**

- Every feature can be turned off from the /dev/null++ settings page, and checks its setting before touching the page.

**Supply chain**

- Runtime dependencies are kept to WXT's browser shim, Anthropic's official SDK (used only in the extension's origin, to
  call Anthropic) and the Geist font files. Everything is locked, audited in CI and kept current by Dependabot.
- CI actions are pinned to commit SHAs and check out without stored credentials. CodeQL scans every change.
