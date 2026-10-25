# Changelog

## 0.1.3 — 2026-10-25

- Remove every right-click menu: the page context menu (link, image, selection, editable and blank branches), the two items appended to SiYuan's native link menu, and the library entry menu. Toolbar and reader panels keep their click menus.
- Remove the internal `siyuan-browser://bookmarks` and `siyuan-browser://history` tab pages. Home sections expand in place instead of jumping to them, the History and Bookmarks commands plus the two "more" menu items are gone, and the sidebar library dock remains the only list view. Clearing a whole list disappears with those pages; single entries can still be removed one by one.
- Target SiYuan 3.8.8 (`minAppVersion`), whose Electron 44 runtime no longer guarantees `getLastWebPreferences`; the host check now only refuses when `webviewTag` is explicitly off.
- Refresh the outline dock far less expensively: the page reports a heading signature first, so cosmetics-only mutations skip the whole-document clone, the cross-process transfer and the article extraction. The signature is dropped on navigation, failures and reader switches.
- Match article headings to source headings with bucketed lookups instead of rescanning the source list for every heading, keeping large documents linear.
- Keep the outline dock's collapsed branches across content refreshes, and ignore pointer events that cannot change the focused tab.
- Skip rebuilding the sidebar list when its content signature is unchanged, which removes up to 100 row rebuilds per tab switch.
- Clamp the page options panel inside the tab body so short splits no longer push it off-screen.
- Fix filter updates failing with `AbortError: The operation was aborted`. The 30 s fetch aborted on stalled routes; each list now gets a longer retry, the default EasyList/EasyPrivacy URLs point at the official `easylist-downloads.adblockplus.org` host, and configs still on `easylist.to` fall back to it automatically.
- Keep the last good copy of each individual list, so one failing subscription no longer discards the whole download, and retry incomplete updates within six hours instead of waiting the full interval.
- Report filter problems honestly: "retaining valid cache" only appears when rules actually loaded, with per-URL reasons such as `timeout 30s` instead of a bare abort.
- Drop every highlight from the toolbar icons. The host's outline button painted a primary ring and turned it into a filled hover and a pressed tint, and pointer presses left a focus ring behind that read as a stuck toggle. Hover, focus, pressed and open states are now flat, and keyboard activation draws no ring either. Disabled history buttons still dim through the host's opacity.
- Make the "more" icon a real toggle like the reader panel: press once to open, press again to dismiss. The menu anchors under that button instead of the address bar, closes when the page options panel opens, and is dismissed when the tab is closed.

## 0.1.2 — 2026-10-22

- Replace the placeholder plugin icon with a blue globe and bookmark on a white-to-light-gray background, with subtle glass highlights.

## 0.1.1 — 2026-10-14

- Show headings retained by reader extraction in SiYuan's outline dock, with hierarchy, collapse and click-to-jump in both webpage and reader views.
- Keep jumped-to headings visible below fixed website navigation bars and restore native outlines when switching back to notes.
- Keep the current outline when login dialogs, ads or other subframes load; invalidate it only on main-document navigation.
- Preserve the last usable extraction during transient failures, exclude dialog content, observe visibility changes and refresh after a modal closes.
- Keep source heading targets stable as headings are inserted or moved, and retain selection and expansion when the outline is unchanged.

The initial outline interactions were verified in macOS SiYuan. The subsequent login-modal fix passed automated regression checks; live CSDN reproduction was skipped at the user's request.

## 0.1.0 — 2026-10-14

First public release.

- Browse websites in native SiYuan tabs with workspace-isolated sessions, address suggestions, bookmarks and history.
- Read extracted articles with adjustable themes, fonts, page zoom and find-in-page.
- Save editable notes, available resources and MHTML snapshots; choose a notebook, parent document or Sprig path, database and tags.
- Copy selected web content into SiYuan blocks using the shared Defuddle converter.
- Include English and Chinese guides with screenshots captured in the actual macOS SiYuan desktop app.

Desktop only, SiYuan 3.8.6+. The documented browsing, reader, clipping and archive workflow was checked on macOS; Windows/Linux native acceptance and additional feature coverage remain open. See [validation](docs/VALIDATION.md).
