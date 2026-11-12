# Architecture

`src/index.ts` registers SiYuan custom tabs, commands, native menus/settings/dialogs and the history/bookmarks dock. `src/view.ts` owns one webview per native tab. `src/adapter.ts` detects host webview availability and loads the bundled main-process module through the desktop host's existing `@electron/remote` API.

`src/tab-surface.ts` keeps each browser surface connected under the host document body. The native custom-tab panel is its geometry anchor: splitting or moving that panel updates the surface bounds without detaching the Electron guest. Mutation/resize observers synchronize bounds and inactive-tab visibility, including in occluded windows where animation frames are suspended. Surface interactions forward pane activation to the native panel. A capture-phase tab-drag guard makes surfaces ignore pointer events before a drag enters guest content, leaving split previews and drop handling to SiYuan. Closing a tab or unloading the plugin disconnects observers and removes its surface; moving a tab within the window does not.

`src/home.ts` and `src/library.ts` render home, bookmarks and history in the host document; `src/entries.ts` provides shared rows and bookmark creation. `src/core.ts` maps three known `siyuan-browser://` routes to fixed blank guest markers so internal pages participate in native back/forward navigation without injecting workspace data into website guests. The dock links to internal pages; bookmarks/history no longer open in list dialogs.

`src/main.ts` installs handlers only for session partitions derived from the absolute workspace path. Guest content never receives the remote API. Node integration is disabled, context isolation and sandboxing are enabled, and web security remains enabled. Popups are denied in Electron and routed to native plugin tabs. Unknown protocols and kernel-port requests are blocked. Permissions are denied by default. No certificate-error exception is registered.

MHTML files are written in a private temporary directory, uploaded as assets, and temporary capture files are removed. Reopening creates a separate ephemeral session, JavaScript disabled, network requests denied, and only the exact MHTML file URL is permitted. Archive files are removed during plugin teardown. Bookmarks/history use versioned plugin data; cookies remain in Electron's partition storage.

Readability identifies article content, DOMPurify sanitizes it, Turndown/GFM produces Markdown. Save jobs record body, each resource and archive independently. A saved document's read-back Markdown is compared before a retry updates it, protecting manual edits. Successful resource/snapshot paths are reused within a job.

Application-level filter settings and cache live under Electron userData. Rule refresh failures retain the last parsed cache. The filter engine operates exclusively on plugin sessions.

Known boundaries and observed acceptance results are recorded separately in VALIDATION.md and FEATURES.md. Unit tests do not establish desktop behavior.
