# Changelog

## 0.1.5 — 2026-11-11

- Add a userscript manager with metadata review, disabled-by-default installation, per-workspace storage, explicit GM grants, isolated execution, pinned HTTPS dependencies and execution logs. See [supported APIs and limitations](docs/USERSCRIPTS.md).

- Include Markdown content snapshots, capture timestamps and source/provenance guidance in bookmark notes.
- Check bookmark snapshot content and age on opening; prompt for missing snapshots, changed content or snapshots older than seven days.
- Add menu actions to check and refresh snapshots; preserve previous content by appending dated revisions.

Validation: 55 automated tests, typecheck and package verification passed. SiYuan kernel checks verified snapshot content/attributes and append preservation. Native snapshot notification interactions remain unverified.

## 0.1.4 — 2026-10-31

- Fix webpage context-menu placement by converting embedder coordinates using only the host zoom; let SiYuan fit menus to viewport edges.

## 0.1.3 — 2026-10-31

- Save webpages as bookmark notes in the document tree, with explicit URL attributes and a clickable link when the plugin is disabled.
- Choose a notebook or parent document in an expandable tree and remember the selected destination.
- Reuse bookmark browser tabs and refresh document icons from website favicons.
- Prefer the current page title over generic metadata and remove timestamp suffixes from saved note titles.
- Prevent embedded webviews from intercepting pointer events during pane resizing.

43 automated tests pass. On macOS SiYuan 3.8.9, plugin reload, the bookmark-note menu, destination dialog and parent selection were checked with native clicks. End-to-end bookmark save/open acceptance remains pending.

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
