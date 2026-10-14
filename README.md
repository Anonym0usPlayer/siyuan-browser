# SiYuan Browser

**English** · [简体中文](README_zh_CN.md)

[![Release](https://img.shields.io/github/v/release/fu1fan/siyuan-browser)](https://github.com/fu1fan/siyuan-browser/releases/latest)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![SiYuan](https://img.shields.io/badge/SiYuan-3.8.6%2B-green)](https://b3log.org/siyuan/)

Browse, read and clip web pages inside SiYuan. Turn articles into editable notes and keep an MHTML snapshot for offline reference.

![Browsing public AI Infra learning material in a native SiYuan tab](docs/screenshots/browse.png)

*All screenshots were captured from the actual plugin running in SiYuan 3.8.6 on macOS. The example is the public [AIInfraGuide](https://caomaolufei.github.io/AIInfraGuide/) website. Private note sidebars were cropped out; screenshots were only cropped and resized.*

## Features

- **Native tabs**: open websites in SiYuan tabs, split panes or separate windows. HTTP(S) note links open in the plugin by default; this can be disabled in settings.
- **Address and search**: enter a URL, domain or search term; search bookmarks, history and provider suggestions. DuckDuckGo is the default search engine.
- **Home and library**: bookmarks, most visited pages, recently closed tabs and history, with configurable section visibility and order. Library pages support search, sorting, deletion and pagination.
- **Reader**: extract the article and adjust theme, font, page zoom, fit-to-width and find-in-page.
- **Page outline**: headings retained by reader extraction appear in SiYuan's outline dock. Click to jump in either the original webpage or reader view; switching back to a note restores its outline.
- **Web clipping**: choose a notebook, parent document or template path; create an editable note, transfer available downloadable resources and save an MHTML snapshot separately.
- **Databases and tags**: optionally select a database, database item template and tags; use Sprig date templates for save paths.
- **Enhanced copy**: paste web or reader selections into SiYuan blocks, preserving supported headings, lists, links, code and formulas.
- **Sessions and filtering**: website cookies use a workspace-specific session isolated from the SiYuan host. Manage filtering subscriptions, temporarily toggle filtering for the current tab, or clear browser data.

## Installation

Requires the **SiYuan desktop app 3.8.6 or newer**. The manifest targets macOS, Windows and Linux. The demonstrated workflow was checked on macOS; native Windows/Linux acceptance remains pending. Mobile and browser frontends cannot host the embedded browser. Remote-kernel mode offers a system-browser fallback.

**SiYuan Bazaar**: after the listing is approved, search for “SiYuan Browser” in Settings → Bazaar → Plugins, then install and enable it.

**Manual installation**: download `package.zip` from the [latest Release](https://github.com/fu1fan/siyuan-browser/releases/latest), extract it into your workspace's `data/plugins/siyuan-browser/`, and enable it under downloaded plugins. `plugin.json` and `index.js` must be directly inside that folder, without an extra enclosing directory. Back up your existing plugin and configuration before upgrading.

## Getting started

1. Open the browser using the globe icon in SiYuan's top bar; enter a URL or search term.
2. Open the reading menu to the left of the address bar and choose “Show reader”.
3. Click “Save to SiYuan” to the right of the bookmark button, choose a destination and confirm.
4. Check the separate article, resource and snapshot results; open the generated note or offline archive.

### Read an article

The reading menu contains the reader, themes, font selection, zoom, fit-to-width, find-in-page and a temporary per-tab filtering toggle. Changing filtering reloads the page; closing the tab restores global filtering behavior.

![Actual reader mode and reading menu](docs/screenshots/reader-menu.png)

Page zoom is adjusted in the reading or More menu. Its 100% follows SiYuan's UI zoom: 125% host zoom with 120% page zoom gives 150% effective zoom. Cmd/Ctrl plus, minus and 0 remain host shortcuts.

### Save a page as a note

Search for a parent document or use a path such as `/Clippings/{{now | date "2006/01"}}`. The dialog previews the destination. A selected database item template determines the location. Confirmed options are remembered; cancellation leaves configuration unchanged.

![Actual clipping destination, database and tag settings](docs/screenshots/save-options.png)

Each explicit save creates a new document without replacing previous clippings. Article, resources and snapshot have separate states. Retry reuses the same job's document and successful resources, checking for user edits before replacing article content. Cancellation stops subsequent stages, although an in-flight request may finish. An uncertain database-template creation response is never automatically repeated.

![Actual clipping job: article saved and verified, MHTML successful](docs/screenshots/save-result.png)

The screenshot shows a real save of the public article. Its text and table became editable SiYuan blocks. This page needed zero resource transfers in that run; this does not establish image or video capture for other sites.

![The generated SiYuan note with native paragraphs and a table](docs/screenshots/saved-note.png)

Extraction and Markdown conversion use **Defuddle 0.19.4**, including formula, footnote, table and code rules. Available LaTeX is preferred; MathML can be converted. Image-only formulas are not OCRed. Parsing uses the loaded page locally without a third-party content-fetching service.

### Copy a passage or reopen an archive

Select web or reader text, copy with Cmd/Ctrl+C or the context menu, then paste normally into SiYuan. Editable controls keep ordinary copying and conversion failures fall back to plain text. Selection copy preserves remote image URLs; it does not download images or save a whole-page snapshot.

Open an archive from the save job or its note link. MHTML uses a separate view with scripts and network requests disabled.

![A real MHTML archive opened in the plugin](docs/screenshots/archive.png)

## Common actions

| Action | Location |
| --- | --- |
| Open a page or search | Top-bar globe, address bar or note links |
| Return home | Browser toolbar home button |
| Reader, fonts, find and zoom | Reading menu left of the address bar |
| Bookmark this page | Star button right of the address bar |
| Clip this page | “Save to SiYuan” beside the star |
| Bookmarks, history, recently closed | Home page, sidebar or More menu |
| Split, separate window or mute | Browser More menu |
| Home, search engine and subscriptions | Plugin settings |

## Data and privacy

- Bookmarks, history and save options are workspace plugin data and may sync with SiYuan. History keeps up to 1,000 recent unique URLs; recently closed keeps up to 50 tabs.
- Website cookies remain in a local Electron workspace-specific session. They are separate from SiYuan data sync; another device may require signing in again.
- Websites, search suggestions, favicons and subscriptions make network requests. Address suggestions for Google, Bing and DuckDuckGo send typed search terms to the selected service. Local bookmark/history suggestions remain available when that service fails.
- Filtering defaults to EasyList / EasyPrivacy with an application-level cache. Initial downloads depend on connectivity; failed updates preserve usable cached rules.
- Clearing plugin browsing data affects its session without deleting notes, assets or bookmarks. History and bookmarks are managed separately.
- The plugin is disabled in SiYuan's publishing service and does not expose browsing records to published pages.

## FAQ

**Why is extraction incomplete?** The clipper reads the loaded DOM. Scroll to load the material you need before saving. Dynamic sites, paywalls and collapsed content may be incomplete. Empty article extraction falls back to sanitized page content.

**Does an archive replace the original website?** Scripts and network access are disabled, so dynamic content may be missing. The plugin does not recursively download ordinary links or record streams, and cannot guarantee offline logins or server interactions. A resource is limited to 32 MiB and MHTML to 256 MiB; blob resources are reported as untransferred.

**What if an image fails to download?** Inspect the job error and retry. Failed embedded resources are removed from the note to avoid automatic remote fetching; article and snapshot stages can still succeed independently.

**Why is a database item missing?** Check the selected database/template and job error. A regular database insertion failure can retry the existing document. If template creation had an uncertain response, check for an already-created item first.

**What has been verified?** This release's live macOS workflow covered public page navigation, reader/menu interactions, clipping with the default template path, the generated note and MHTML opening. Database templates, the complete context-menu/download matrix and Windows/Linux were not accepted through this live run. See [validation](docs/VALIDATION.md), which is currently in Chinese.

## Development and feedback

Requires Node.js 22 or newer.

```sh
git clone https://github.com/fu1fan/siyuan-browser.git
cd siyuan-browser
npm ci
npm run typecheck
npm test
npm run build
npm run verify:package
```

Build outputs are `dist/` and `package.zip`. See [architecture](docs/ARCHITECTURE.md), [feature boundaries](docs/FEATURES.md), [release guide](docs/RELEASING.md) and [changelog](CHANGELOG.md).

Please include SiYuan/plugin versions, OS, reproduction steps and redacted logs when [filing an issue](https://github.com/fu1fan/siyuan-browser/issues).

## Credits and license

Thanks to [SiYuan](https://github.com/siyuan-note/siyuan), [Defuddle](https://github.com/kepano/defuddle), [DOMPurify](https://github.com/cure53/DOMPurify) and [Ghostery adblocker](https://github.com/ghostery/adblocker). The guide structure follows locally installed SiYuan Codex, Importer and browser plugins; the public example is [AIInfraGuide](https://github.com/caomaolufei/AIInfraGuide).

Licensed under [MIT](LICENSE). Dependencies retain their own licenses; see [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md). This is an independent community plugin.
