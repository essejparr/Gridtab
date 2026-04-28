# GridTab

A Chrome extension that replaces the New Tab page with a clean dashboard of your favorite sites, arranged as a grid of connected square tiles.

Built with Manifest V3, plain HTML/CSS/JS, and `chrome.storage.local`. No dependencies, no tracking, no external scripts.

---

## Features

- **Custom New Tab dashboard** — opens whenever you create a new tab.
- **Square, responsive tiles** — favorites display as a grid of equally-sized blocks that wrap automatically on any screen size.
- **Add / edit / delete favorites** — manage your list from a simple modal.
- **URL normalization** — entering `github.com` automatically becomes `https://github.com`. Invalid URLs are rejected with inline feedback.
- **Favicons** — fetched on the fly from a public favicon service, with a letter-avatar fallback if the favicon can't load.
- **Local persistence** — saved to `chrome.storage.local`, so your list syncs across new tabs in the same browser profile.
- **Light + dark mode** — automatically follows your OS theme via `prefers-color-scheme`.

---

## Setup — load the unpacked extension

1. Download or clone this folder so you have a local copy of the `gridtab/` directory.
2. Open Chrome and go to `chrome://extensions`.
3. Toggle **Developer mode** on (top-right corner).
4. Click **Load unpacked**.
5. Select the `gridtab/` folder.
6. Open a new tab — you'll see the GridTab dashboard.

To update the extension after editing files, return to `chrome://extensions` and click the refresh icon on the GridTab card.

---

## How it works

The extension is intentionally small. It consists of five files plus three icons:

| File | Purpose |
| --- | --- |
| `manifest.json` | Declares Manifest V3, the `storage` permission, and overrides the New Tab page via `chrome_url_overrides`. |
| `newtab.html` | Markup for the header, grid, empty state, and add/edit modal. |
| `newtab.css` | All styling. Uses CSS variables for theming and CSS Grid (`auto-fill` + `aspect-ratio: 1 / 1`) to produce square, responsive tiles. |
| `newtab.js` | Loads favorites from `chrome.storage.local`, renders the grid, and handles add/edit/delete + URL validation. |
| `README.md` | This file. |

### New Tab override

`manifest.json` declares:

```json
"chrome_url_overrides": { "newtab": "newtab.html" }
```

When the user opens a new tab, Chrome serves `newtab.html` instead of the default Google page.

### Storage model

Favorites are stored in `chrome.storage.local` under a single key, `favorites`, as an array of objects:

```js
{
  id: "uuid-or-fallback",
  title: "GitHub",
  url: "https://github.com/",
  createdAt: 1700000000000
}
```

`chrome.storage.local` is used (not `localStorage`) because it's the official extension API for persistence — it's larger, async, and works correctly inside the extension context.

The page also subscribes to `chrome.storage.onChanged`, so if you add a favorite in one new tab it appears in any other open new tab automatically.

### Permissions

Only `storage` is requested. Favicons are fetched from a public URL (no host permission needed), and no other Chrome APIs are used.

### URL handling

`normalizeUrl()` in `newtab.js`:

1. Trims whitespace.
2. Prepends `https://` if no scheme is present.
3. Parses with the `URL` constructor.
4. Rejects anything that isn't `http:` / `https:` or that lacks a hostname with a dot.

This keeps the input forgiving while preventing junk like `javascript:` or empty values from ending up in the grid.

### Tile layout

The grid uses:

```css
display: grid;
grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
gap: 16px;
```

…with each tile set to `aspect-ratio: 1 / 1`. That combination produces equally-sized squares that automatically reflow into more or fewer columns as the viewport resizes — which is what gives the layout its "connected blocks" feel.

---

## Where future features could be added

The codebase is structured so each of these would be a focused addition:

- **Drag-and-drop reordering** — wire up `pointerdown`/`pointermove` (or the HTML5 drag API) on each tile, reorder the `favorites` array, then call `saveFavorites()` and re-render. The render function already keys off `favorites` order, so no other changes are needed.
- **Folders or groups** — extend the favorite object with a `groupId` field and render section headers above the grid.
- **Import / export** — add buttons that read/write `favorites` as JSON; handy for backup or moving between profiles.
- **Sync across devices** — swap `chrome.storage.local` for `chrome.storage.sync`. The interface is identical; only the storage area changes.
- **Search bar** — a header `<input>` that filters tiles by title/domain on `input` events.
- **Custom backgrounds or themes** — add a settings modal that writes a theme preference to storage and toggles a class on `<body>`.
- **Keyboard shortcuts** — number-key navigation (1–9 to open the first nine tiles), or `/` to focus a search field.
- **Bookmark import** — use the `bookmarks` permission to seed the grid from existing Chrome bookmarks.

Each of these can slot in without restructuring the existing code.

---

## Privacy

GridTab does not include analytics, tracking, ads, or any external scripts. The only outbound network request the page makes is to `https://www.google.com/s2/favicons` to fetch favicons for the sites you've added. If you'd prefer no outbound requests at all, remove the `<img>` block in `buildTile()` in `newtab.js` — the letter-avatar fallback will be used for every tile.
