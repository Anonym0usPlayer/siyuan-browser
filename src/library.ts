import { INTERNAL_URLS, type LibraryKind } from "./core";
import { element, button, icon } from "./ui";
import { entryRow, addBookmarkDialog } from "./entries";
import type BrowserPlugin from "./index";

export class LibraryPage {
  root = element("section", "sb-home sb-internal-library");
  filter = element("input", "b3-text-field");
  sort = element("select", "b3-select");
  count = element("span", "sb-library-count ft__on-surface");
  results = element("div", "sb-library-results");
  clear: HTMLButtonElement;
  limit = 50;
  constructor(
    public plugin: BrowserPlugin,
    public kind: LibraryKind,
    public navigate: (url: string) => void,
  ) {
    const content = element("div", "sb-library-content");
    const nav = element("nav", "sb-internal-nav");
    nav.setAttribute("aria-label", plugin.t("internalPages"));
    for (const page of ["home", "bookmarks", "history"] as const) {
      const item = button(
        plugin.t(page === "home" ? "browserHome" : page),
        () => navigate(INTERNAL_URLS[page]),
      );
      if (page === kind) item.setAttribute("aria-current", "page");
      nav.append(item);
    }
    const header = element("header", "sb-home-header");
    const heading = element("div", "sb-home-heading");
    const title = element("h1", "");
    title.append(
      icon(kind === "bookmarks" ? "iconBookmark" : "iconHistory"),
      document.createTextNode(plugin.t(kind)),
    );
    heading.append(
      title,
      element("p", "ft__on-surface", plugin.t(kind + "Intro")),
    );
    const actions = element("div", "sb-library-actions");
    if (kind === "bookmarks")
      actions.append(
        button(plugin.t("addBookmark"), () => addBookmarkDialog(plugin)),
      );
    this.clear = button(
      plugin.t(kind === "history" ? "clearHistory" : "clearBookmarks"),
      () => plugin.clearEntries(kind),
    );
    actions.append(this.clear);
    header.append(heading, actions);
    const tools = element("div", "sb-library-tools");
    this.filter.placeholder = plugin.t(
      kind === "bookmarks" ? "searchBookmarks" : "searchHistory",
    );
    this.filter.setAttribute("aria-label", this.filter.placeholder);
    this.filter.type = "search";
    for (const [value, key] of [
      ["newest", "sortNewest"],
      ["oldest", "sortOldest"],
      ...(kind === "bookmarks" ? [["title", "sortTitle"]] : []),
    ]) {
      const option = element("option", "", plugin.t(key));
      option.value = value;
      this.sort.append(option);
    }
    this.sort.setAttribute("aria-label", plugin.t("sort"));
    for (const input of [this.filter, this.sort])
      input.addEventListener(input === this.filter ? "input" : "change", () => {
        this.limit = 50;
        this.refresh();
      });
    tools.append(this.filter, this.sort, this.count);
    content.append(nav, header, tools, this.results);
    this.root.append(content);
    this.root.hidden = true;
    this.refresh();
  }
  refresh() {
    const p = this.plugin;
    const query = this.filter.value.trim().toLocaleLowerCase();
    const entries = p.config[this.kind].filter((e) =>
      (e.title + " " + e.url).toLocaleLowerCase().includes(query),
    );
    entries.sort((a, b) =>
      this.sort.value === "title"
        ? (a.title || a.url).localeCompare(b.title || b.url)
        : this.sort.value === "oldest"
          ? a.time - b.time
          : b.time - a.time,
    );
    this.count.textContent = `${entries.length} / ${p.config[this.kind].length}`;
    this.clear.disabled = !p.config[this.kind].length;
    this.results.replaceChildren();
    if (!entries.length) {
      this.results.append(
        element(
          "p",
          "sb-home-empty ft__on-surface",
          p.t(query ? "noMatchingPages" : this.kind + "Empty"),
        ),
      );
      return;
    }
    const list = element("div", "b3-list sb-home-list");
    let previousDay = "";
    for (const entry of entries.slice(0, this.limit)) {
      if (this.kind === "history") {
        const day = entry.time
          ? new Date(entry.time).toLocaleDateString()
          : p.t("unknownDate");
        if (day !== previousDay)
          list.append(element("h2", "sb-library-day ft__on-surface", day));
        previousDay = day;
      }
      list.append(entryRow(p, entry, this.kind, this.navigate));
    }
    this.results.append(list);
    if (entries.length > this.limit)
      this.results.append(
        button(p.t("loadMore"), () => {
          this.limit += 50;
          this.refresh();
        }),
      );
  }
}
