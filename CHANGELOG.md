# Changelog

## 0.1.7 — 2026-11-12

### Imported from upstream 0.1.3 – 0.1.6

- Save webpages as bookmark notes in the document tree: explicit URL attributes, a clickable link that still works when the plugin is off, a notebook or parent document chosen in an expandable tree with the destination remembered, and site icons reused as document icons. The current page title wins over generic metadata and timestamp suffixes are stripped from saved note titles.
- Snapshot what a bookmark looked like: bookmark notes carry Markdown content, a capture timestamp and provenance guidance, the snapshot is checked against the page when it opens (missing, changed, or older than seven days), and a new check or refresh appends a dated revision instead of overwriting the earlier content.
- Add a userscript manager with metadata review, installation disabled by default, per-workspace storage, explicit GM grants, isolated execution, pinned HTTPS dependencies and an execution log — see [docs/USERSCRIPTS.md](docs/USERSCRIPTS.md).
- Keep browser surfaces alive when SiYuan moves or splits a tab panel, so the live page, unsaved input and scroll position survive; native tab drags reach split targets immediately, inactive tabs respect background-window visibility, and browser clicks hand focus to SiYuan's pane handling.
- Stop embedded webviews from swallowing pointer events during pane resizing.

### This fork

- Edit a bookmark in a dialog, the way a browser does. The pencil next to the delete button opens a small form with the name and the address already filled in, so a bookmark saved under a useless page title — a login wall, "Just a moment..." — can be renamed and repointed instead of deleted and added again. Saving repoints the bookmark in place and keeps its position, visit count and stored icon unless the host actually changed; a blank name, an unusable address and an address that is already bookmarked keep the dialog open and say why, with the caret left in the field that needs fixing. Enter saves from either field, and Escape or Cancel leaves the entry untouched. The earlier in-place editor is gone along with its problem: it put the caret inside the row's link, where a plain click ran the link's own activation behaviour and opened the page.
- Shrink the row actions. The buttons were 26 px targets with 16 px glyphs; they are now 22 px targets with 13 px glyphs, in one cluster against the row's right edge at 55% opacity that only reaches full strength under the pointer, so a row reads as text until it is actually hovered.
- Keep the fork's menu policy while importing the new features: only home rows answer a right-click, because that is where bookmark notes and snapshots are reachable from; the webpage and reader context menus stay removed. Upstream's `src/context-menu.ts` and its regression test went with the menus they served, since nothing else in this fork builds a native menu from a webview point.

## 0.1.5 — 2026-11-04

- Render the home page inside its own shadow root. Rows, lists and section headings used to be host-classed nodes styled from the plugin sheet, so any theme, companion plugin or CSS snippet could repaint a row's fill, margin and radius — and out-specifying them only moved the problem to whoever was injected last. The page now ships its own stylesheet and clones the host's icon sprite into the root, so nothing outside it can reach a row; the same markup renders identically under Daylight, Neo or a hostile `!important` override. Rows and the layout controls drop the borrowed `b3-list` / `b3-list-item` classes, which also removes the host's `margin: 1px 8px` + `padding: 0 4px` that shrank each section's list by a different amount and painted a block behind every row.
- Rebuild the home page layout: sections flow in two columns and fall back to one under 760 px, the title, description and a "customize" popover share one header instead of a permanent settings panel, and rows are compact 26 px lines with the favicon in a rounded badge over a title-and-host-name stack. Every row ends in the same fixed 72 px monospaced cell, so dates and visit counts start and end on the same x in all four sections instead of drifting with the width of their own digits; the delete button floats at the row's far right, past that cell, so a row without an action and a row with one leave the timestamp in the same place and revealing the button reflows nothing.
- Keep the settings dialog working against the shared stylesheet: the layout controls stay in the light DOM with plugin-only class names and are styled by the same sheet the shadow root uses.

## 0.1.4 — 2026-10-26

- Make the toolbar star a real bookmark toggle: it is filled when the current page is already saved and hollow when it is not, and a press adds or removes that bookmark instead of only adding. The state also clears when the bookmark is deleted from the home page or the sidebar, and survives back/forward navigation.
- Name a bookmark after the page title. The saved title comes from the live guest title, then the title the tab already shows, and only falls back to the host name when the page has none, so pressing the star early in a load no longer stores a URL as the name.

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
