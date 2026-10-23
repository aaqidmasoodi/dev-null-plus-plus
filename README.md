<h1 align="center">dev/null++</h1>
<p align="center">Extra powers for <a href="https://dev-null.sh">dev-null.sh</a>, the social network for developers.<br>
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/intro-dark.webp"><img src="docs/media/intro-light.webp" alt="dev/null++" width="560"></picture></p>

## Features

Each has a switch under **/dev/null++** in the site's menu. All are on from the start, except themes, which you pick.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/themes-dark.webp"><img src="docs/media/themes-light.webp" alt="dev-null.sh in each of the five themes" width="780"></picture><br><b>Themes</b><br>Five complete looks for the whole site: Terminal Modern, Neo Tokyo, Encyclopedia, Sugar Cloud and Retro OS. Or make your own: the brush on the page's edge opens an editor, and the page shows each change as you make it.</p>

<table align="left"><tr><td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/rewrite-dark.webp"><img src="docs/media/rewrite-light.webp" alt="Rewriting a draft" width="380"></picture><br><b>Rewrite with AI</b><br>Improve, shorten or fix a draft in the composer.<br>Bring your own AI key.</td></tr></table>
<table align="left"><tr><td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/preview-dark.webp"><img src="docs/media/preview-light.webp" alt="A link preview" width="380"></picture><br><b>Link preview</b><br>Press and hold a link to open it<br>over your log, at any width.</td></tr></table>
<table align="left"><tr><td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/peek-dark.webp"><img src="docs/media/peek-light.webp" alt="An image held up close" width="380"></picture><br><b>Image peek</b><br>Press and hold an image to see it big.<br>Let go and it goes back.</td></tr></table>
<table align="left"><tr><td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/pip-dark.webp"><img src="docs/media/pip-light.webp" alt="A floating video" width="380"></picture><br><b>Picture-in-picture</b><br>Videos float to a corner as you scroll,<br>even across pages.</td></tr></table>
<table align="left"><tr><td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/commits-dark.webp"><img src="docs/media/commits-light.webp" alt="New commits arriving" width="380"></picture><br><b>New commits</b><br>At the top of your log,<br>new commits load by themselves.</td></tr></table>
<table align="left"><tr><td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/follow-dark.webp"><img src="docs/media/follow-light.webp" alt="Swiping through people" width="380"></picture><br><b>Who to follow</b><br>A stack of cards. Swipe one away,<br>follow from the card.</td></tr></table>
<br clear="both">

## Install

Download from the [latest release](https://github.com/aaqidmasoodi/dev-null-plus-plus/releases/latest).

**Chrome, Edge, Brave**

1. Download `dev-null-plus-plus-<version>-chrome.zip` and unzip it into a folder you will keep.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick that folder.

To update, unzip the new version over the same folder, then click the extension's reload button. Your settings and AI key stay. A different folder counts as a new extension and starts afresh.

**Firefox 140+**

1. Download `dev-null-plus-plus-<version>-firefox.xpi`.
2. Drag it into a Firefox window and confirm.

To update, do the same with the new `.xpi`. Your settings stay.

If a release only has `-firefox.zip` (not signed by Mozilla yet), open `about:debugging`, **This Firefox**, **Load Temporary Add-on** and pick the zip. Firefox removes it when it restarts.

Once it is installed, /dev/null++ tells you at the top of dev-null.sh when a new version is out.

[Development](docs/DEVELOPMENT.md) · [Security](SECURITY.md) · [Logo licence](LOGO.md) · MIT
