# GridTab

A Chrome extension that replaces the New Tab page with a clean,
customizable dashboard of your favorite sites — arranged as a grid of
square tiles you can organize, color, and group into folders.

Built with Manifest V3, plain HTML/CSS/JS, and `chrome.storage.local`.
No dependencies, no tracking, no external scripts.

---

## Features

- **Drag-and-drop tile reordering** with insertion previews
- **Folders** — create by drag-merging two tiles, custom colors, inline
  expansion, drag children in and out freely
- **34 built-in themes** across light, muted, and dark sections
- **Custom icon uploads** or auto-fetched favicons (PNG/SVG)
- **Search bar** with 8 engines: Google, DuckDuckGo, Bing, Brave,
  Ecosia, Kagi, Perplexity, YouTube
- **Adjustable layout** — tile size, spacing, icon scale
- **Customizable accent button color** with 15 palette options plus
  theme-default
- **Press "/"** anywhere to focus the search bar
- **Press Esc** to close any open modal or popover
- **Local-only data** — favorites, folders, and preferences stored
  via `chrome.storage.local`. Nothing transmitted, no analytics, no
  tracking

---

## Install (end users)

The extension will be available on the Chrome Web Store. (Link to be
added once approved.)

## Install (development / unpacked)

1. Clone or download this repo.
2. Open Chrome → `chrome://extensions`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** → select the `gridtab/` folder.
5. Open a new tab — the dashboard appears.

---

## Permissions

GridTab requests one permission only: `storage`. This is used to save
your tile configuration, folder structure, and preferences locally.
No other permissions, no host permissions, no remote code.

See [PRIVACY.md](./PRIVACY.md) for the full privacy policy.

---

## Repository layout

```
gridtab/
├── manifest.json          # MV3 extension manifest
├── newtab.html            # the New Tab page
├── newtab.css             # all theme variables and styles
├── newtab.js              # all behavior (no build step)
├── icons/                 # toolbar icons (16/48/128)
├── store-assets/          # Web Store listing assets — NOT shipped
├── PRIVACY.md             # privacy policy
└── README.md              # this file
```

## Building a release zip

```bash
zip -r gridtab.zip . \
  -x "*.DS_Store" \
  -x "store-assets/*" \
  -x ".gitignore" \
  -x "PRIVACY.md" \
  -x "README.md"
```

This excludes everything that doesn't need to ship inside the
installed extension (store assets, repo metadata, docs).
