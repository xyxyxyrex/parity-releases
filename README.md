# Parity

Parity is a desktop workspace for capturing websites, comparing implementations with designs, editing elements, running audits, and organizing evidence-based QA findings.

- [Download the latest Windows installer](https://github.com/xyxyxyrex/parity-releases/releases/latest)
- [Website and setup instructions](https://parity-gfx.pages.dev)
- [Changelogs](https://parity-gfx.pages.dev/#changelogs)
- [Privacy policy](https://parity-gfx.pages.dev/privacy/)

## Install on Windows

Download `Parity-Setup-<version>.exe` from Releases, or run:

```powershell
irm https://parity-gfx.pages.dev/install.ps1 | iex
```

Installed Parity versions check for updates automatically. No GitHub account or GitHub access token is required.

## Updating older installations

v1.5.8 changes the update feed to this repository. The original source repository is now private. Installations older than v1.5.8 must download and install the latest installer from this repository or the website. Keep your normal installation destination; the installer preserves application data. v1.5.8 and newer installations receive updates from this public repository.

## Repository contents

This repository hosts official installers, update metadata, and product release notes. Application source is maintained separately. GitHub's automatic “Source code” archives contain only this distribution repository's documentation; they are not the Parity application source.

`latest.yml` and `.blockmap` are used by the desktop updater. Most users need only the `.exe` installer.
