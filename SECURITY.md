# Security

dev/null++ runs inside your signed-in dev-null.sh session, so it is built to be safe first and fast second. Every
feature follows the rules below. If a rule makes something slower or more work, the rule wins.

## Reporting a vulnerability

Please report it privately through
[GitHub security advisories](https://github.com/aaqidmasoodi/dev-null-plus-plus/security/advisories/new), not in a
public issue.

## Threat model

The extension has three parts, trusted in this order:

1. **The background service worker.** Trusted. It is the only part that holds secrets, such as API keys, and the only
   part that makes network requests.
2. **The content scripts** on dev-null.sh. Partly trusted. They share the page's process, so a compromised page could
   reach them. They never hold secrets.
3. **The page itself**: dev-null.sh's DOM, its scripts, its storage, and the main-world probe. Untrusted. Anything read
   from it, including attributes our own probe sets and events like `inertia:navigate`, can be forged by the page. It
   may only ever trigger harmless, idempotent work.

## Rules

**Permissions**

- Ask for the least. Today that is `scripting` and `https://dev-null.sh/*`, nothing else. The e2e suite fails if the
  list grows, so adding one is a deliberate change.
- Content scripts run on dev-null.sh only, top frame only, and check that again at start-up.
- No `web_accessible_resources`, and `externally_connectable` admits no other extension and no web page.

**Code and markup**

- No HTML strings, ever: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `srcdoc` and `document.write` are banned by
  lint. Build nodes with `createElement` and set text with `textContent`.
- No `eval` or `new Function`. The extension CSP forbids them and lint bans them.
- The extension's own pages run under a deny-everything CSP with Trusted Types (`EXTENSION_PAGES_CSP` in
  `src/core/constants.ts`). Network access is `connect-src 'none'` until a feature needs an API, and then only that
  API's exact origin is added.

**Messages**

- Every message is checked for both its shape and its sender (`src/core/messages.ts`). Content scripts accept only our
  own background. The background accepts only our content script in the top frame of a dev-null.sh tab. Unknown fields
  are rejected, not ignored.
- No `postMessage` channels with the page.

**Secrets and data**

- API keys live in `browser.storage.local`. Only the background reads them, and it never sends them to a content
  script. They are never put in the DOM, in page storage (`localStorage` and friends are banned), in URLs or in logs.
- Content scripts never make network requests themselves. They ask the background, which makes the request. Lint
  enforces this.
- Anything that has to show a secret, such as a field to paste a key into, is an extension page in an isolated frame,
  never an element on dev-null.sh. Page scripts can read any shadow root on the page.
- The logger redacts anything shaped like an API key or bearer token, and drops stacks.
- Only what a feature needs leaves the browser, only to the provider you configured, and only when you act.

**Features**

- Every feature can be turned off from the /dev/null++ settings page, and checks its setting before touching the page.

**Supply chain**

- No runtime dependencies beyond WXT's browser shim. Development dependencies are locked, audited in CI and kept current
  by Dependabot.
- CI actions are pinned to commit SHAs and check out without stored credentials. CodeQL scans every change.
