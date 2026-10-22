# Changelog

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
