import {
  mostVisited,
  moveHomeSection,
  readHomeLayout,
  type Entry,
  type HomeSection,
} from "./core";
import { element, button, icon, iconButton } from "./ui";
import { entryRow, addBookmarkDialog } from "./entries";
import type BrowserPlugin from "./index";

const sectionIcons: Record<HomeSection, string> = {
  bookmarks: "iconBookmark",
  mostVisited: "iconStar",
  recentlyClosed: "iconRefresh",
  history: "iconHistory",
};

/** Shared by the homepage and plugin settings; hidden sections stay sortable. */
export function homeLayoutControls(plugin: BrowserPlugin) {
  const root = element("div", "sb-home-layout b3-list");
  let dragging: HomeSection | undefined;
  const current = () => readHomeLayout(plugin.config.homeLayout);
  const render = (focus?: string) => {
    root.replaceChildren();
    const layout = readHomeLayout(plugin.config.homeLayout);
    for (const [index, section] of layout.order.entries()) {
      const row = element("div", "b3-list-item sb-home-layout-row");
      row.dataset.section = section;
      const handle = element("span", "sb-home-drag");
      handle.append(icon("iconDrag"));
      handle.title = plugin.t("dragSection");
      handle.draggable = true;
      handle.addEventListener("dragstart", (event) => {
        dragging = section;
        event.dataTransfer?.setData("text/plain", section);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      handle.addEventListener("dragend", () => {
        dragging = undefined;
        root
          .querySelectorAll(".sb-home-drop")
          .forEach((r) => r.classList.remove("sb-home-drop"));
      });
      row.addEventListener("dragover", (event) => {
        if (!dragging || dragging === section) return;
        event.preventDefault();
        row.classList.add("sb-home-drop");
      });
      row.addEventListener("dragleave", () =>
        row.classList.remove("sb-home-drop"),
      );
      const commit = (next: typeof layout, control?: string) => {
        plugin.config.homeLayout = next;
        plugin.persist();
        render(control);
      };
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        if (dragging) commit(moveHomeSection(current(), dragging, section));
        dragging = undefined;
      });
      const label = element("label", "sb-home-toggle");
      const toggle = element("input", "b3-switch");
      toggle.type = "checkbox";
      toggle.checked = !layout.hidden.includes(section);
      toggle.dataset.control = section + "-toggle";
      toggle.setAttribute("aria-label", plugin.t(section));
      toggle.addEventListener("change", () => {
        const latest = current();
        commit(
          {
            ...latest,
            hidden: toggle.checked
              ? latest.hidden.filter((s) => s !== section)
              : [...new Set([...latest.hidden, section])],
          },
          toggle.dataset.control,
        );
      });
      label.append(element("span", "", plugin.t(section)), toggle);
      row.append(handle, label);
      for (const [step, name, text] of [
        [-1, "iconUp", "moveUp"],
        [1, "iconDown", "moveDown"],
      ] as const) {
        const control = section + "-" + text;
        const move = iconButton(
          name,
          plugin.t(text) + " · " + plugin.t(section),
          () => {
            const latest = current();
            commit(
              moveHomeSection(
                latest,
                section,
                latest.order[latest.order.indexOf(section) + step],
              ),
              control,
            );
          },
        );
        move.dataset.control = control;
        move.disabled = index + step < 0 || index + step >= layout.order.length;
        row.append(move);
      }
      root.append(row);
    }
    if (focus)
      root.querySelector<HTMLElement>(`[data-control="${focus}"]`)?.focus();
  };
  render();
  return root;
}

export class HomePage {
  root = element("section", "sb-home");
  sections = element("div", "sb-home-sections");
  search = element("input", "b3-text-field sb-home-search-input");
  expanded = new Set<HomeSection>();
  constructor(
    public plugin: BrowserPlugin,
    public navigate: (url: string) => void,
  ) {
    const header = element("header", "sb-home-header");
    const heading = element("div", "sb-home-heading");
    heading.append(
      element("h1", "", plugin.t("browserHome")),
      element("p", "ft__on-surface", plugin.t("homeIntro")),
    );
    const customize = element("details", "sb-home-customize");
    const summary = element("summary", "b3-button b3-button--outline");
    summary.append(
      icon("iconSettings"),
      document.createTextNode(plugin.t("customizeHome")),
    );
    customize.append(summary);
    customize.addEventListener("toggle", () => {
      if (!customize.open) return;
      customize.querySelector(".sb-home-customize-panel")?.remove();
      const panel = element("div", "sb-home-customize-panel");
      panel.append(
        element("p", "ft__on-surface", plugin.t("homeLayoutHint")),
        homeLayoutControls(plugin),
      );
      customize.append(panel);
    });
    header.append(heading, customize);
    const form = element("form", "sb-home-search");
    this.search.placeholder = plugin.t("address");
    this.search.setAttribute("aria-label", plugin.t("address"));
    const searchButton = button(plugin.t("search"), () => form.requestSubmit());
    form.append(icon("iconSearch"), this.search, searchButton);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.search.value.trim()) this.navigate(this.search.value);
    });
    this.root.append(header, form, this.sections);
    this.refresh();
  }
  refresh() {
    const p = this.plugin;
    this.sections.replaceChildren();
    const layout = readHomeLayout(p.config.homeLayout);
    for (const section of layout.order.filter(
      (s) => !layout.hidden.includes(s),
    )) {
      const entries: Entry[] =
        section === "mostVisited"
          ? mostVisited(p.config.history)
          : p.config[section] || [];
      const block = element("section", "sb-home-section");
      block.dataset.section = section;
      const header = element("div", "sb-home-section-header");
      const title = element("h2", "");
      title.append(
        icon(sectionIcons[section]),
        document.createTextNode(p.t(section)),
        element("span", "sb-home-count", String(entries.length)),
      );
      header.append(title);
      const actions = element("div", "sb-home-section-actions");
      if (section === "bookmarks")
        actions.append(
          iconButton("iconAdd", p.t("addBookmark"), () => this.addBookmark()),
        );
      header.append(actions);
      block.append(header);
      if (!entries.length) {
        block.append(
          element("p", "sb-home-empty ft__on-surface", p.t(section + "Empty")),
        );
      } else {
        const list = element("div", "b3-list sb-home-list");
        const limit = this.expanded.has(section)
          ? entries.length
          : section === "bookmarks" || section === "history"
            ? 10
            : 6;
        for (const entry of entries.slice(0, limit))
          list.append(entryRow(p, entry, section, this.navigate));
        block.append(list);
        if (entries.length > limit || this.expanded.has(section)) {
          const more = button(
            p.t(this.expanded.has(section) ? "showLess" : "showAll"),
            () => {
              if (this.expanded.has(section)) this.expanded.delete(section);
              else this.expanded.add(section);
              this.refresh();
            },
          );
          more.classList.add("sb-home-more");
          block.append(more);
        }
      }
      this.sections.append(block);
    }
    if (!this.sections.children.length)
      this.sections.append(
        element("p", "sb-home-empty ft__on-surface", p.t("homeAllHidden")),
      );
  }
  addBookmark() {
    addBookmarkDialog(this.plugin);
  }
}
