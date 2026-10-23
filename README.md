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

Go to the [latest release](https://github.com/aaqidmasoodi/dev-null-plus-plus/releases/latest) and download one file, under **Assets**:

| Browser             | File to download                                   |
| ------------------- | -------------------------------------------------- |
| Chrome, Edge, Brave | the one ending in `-chrome.zip`                    |
| Firefox             | the one ending in `-firefox.xpi` or `-firefox.zip` |

Ignore **Source code (zip)** and **Source code (tar.gz)**. GitHub adds them to every release; they are the project's code, not the extension.

**Chrome, Edge or Brave**

1. Unzip the file you downloaded. On Windows, right-click it and choose **Extract All**. On a Mac, double-click it. Keep the folder somewhere it will stay, like Documents.
2. Open `chrome://extensions` (in Edge, `edge://extensions`; in Brave, `brave://extensions`).
3. Turn on **Developer mode**, top right.
4. Click **Load unpacked** and choose the unzipped folder.
5. Open [dev-null.sh](https://dev-null.sh). **/dev/null++** is in the menu, under Settings.

**Firefox, with a `.xpi` file**

1. Open the file, or drag it into a Firefox window, and click **Add**.

**Firefox, with a `.zip` file** (not yet signed by Mozilla)

1. Do not unzip it. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and choose the file.

Firefox removes a temporary add-on when it restarts, so repeat these two steps after a restart.

**Updating**

dev-null.sh tells you at the top of the page when a new version is out. In Chrome, Edge or Brave, unzip the new file into the **same folder** as before, replacing the files, then click the reload arrow on /dev/null++ in `chrome://extensions`. Your settings and AI key stay. In Firefox, install the new file the same way as the first.

[Development](docs/DEVELOPMENT.md) · [Security](SECURITY.md) · [Logo licence](LOGO.md) · MIT
