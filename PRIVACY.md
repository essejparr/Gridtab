# GridTab Privacy Policy

**Last updated:** May 1, 2026

GridTab is a browser extension that replaces the Chrome New Tab page with
a customizable dashboard of favorite-site tiles. This document explains
what data the extension handles and how.

## What we collect

**Nothing.**

GridTab does not operate any servers, does not log usage, does not run
analytics, and has no way to identify you. There is no account system,
no telemetry, no crash reporting, no advertising network, and no third
party that receives information about you because of GridTab.

## What is stored locally

GridTab stores the following on your device using the Chrome
`chrome.storage.local` API:

- The list of favorites you have added (titles, URLs, optional custom
  icons)
- The folder structure you have created (folder names, colors,
  open/closed state)
- Your preferences (theme, tile size, spacing, icon size, search engine,
  button color)

This data lives in your browser. It is not transmitted to GridTab, the
developer, or any third party. It is not synced across devices unless
Chrome's own browser sync is enabled in your Chrome account settings —
in which case the data sync is performed by Chrome and governed by
Google's privacy policy, not by GridTab.

## Network requests

GridTab makes only one kind of outbound request: fetching favicon images
so your tiles display the correct icons.

These requests are made by your browser directly to:

- Google's public favicon service
  (`https://www.google.com/s2/favicons`) as a fallback
- The websites you have added as favorites, when fetching their own
  icon files (e.g. `apple-touch-icon.png`)

GridTab does not proxy or log these requests. The behavior is the same
as your browser fetching any other image on the web. If you are
concerned about a website learning that you have added it as a
favorite, note that this would be visible to that website only when its
own favicon is fetched — and only in the same way it would be visible
when you simply visit that website.

## Permissions

GridTab requests one Chrome permission: `storage`. This is used solely
to persist your dashboard locally as described above.

GridTab does not request access to your browsing history, bookmarks,
tabs, cookies, downloads, or any other browser data.

## Custom icons

If you upload a custom icon for a favorite, the image data is stored
locally in your browser's storage as a base64-encoded string. It is
never uploaded anywhere.

## Uninstalling

When you uninstall GridTab, Chrome removes all stored data along with
the extension. There is nothing to delete elsewhere.

## Children

GridTab is a productivity tool and is not directed at children. It does
not collect data from anyone.

## Changes to this policy

If this policy changes, the change will be reflected in the file in
the GridTab repository, with an updated "Last updated" date at the top.

## Contact

For questions about this policy, please open an issue in the GitHub
repository or contact the developer directly.
