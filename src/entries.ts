import type { Entry, ClosedEntry, HomeSection } from "./core";
import { element, button, iconButton, dialog, field } from "./ui";
import type BrowserPlugin from "./index";
import { entryFaviconURL } from "./favicon";

export function entryTime(time: number) {
  return time
    ? new Date(time).toLocaleString(undefined, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}

/** Shared list rows keep home summaries and internal pages visually consistent. */
export function entryRow(
  p: BrowserPlugin,
  entry: Entry,
  section: HomeSection,
  navigate: (url: string) => void,
) {
  const row = element("div", "b3-list-item sb-home-row");
  const link = element("a", "sb-home-link");
  link.href = entry.url;
  link.title = entry.url;
  const url = new URL(entry.url);
  const badge = element("span", "sb-home-site");
  const fallback = element(
    "span",
    "sb-home-site-letter",
    url.hostname
      .replace(/^www\./, "")
      .slice(0, 1)
      .toUpperCase(),
  );
  badge.append(fallback);
  badge.setAttribute("aria-hidden", "true");
  queueMicrotask(() => {
    if (!row.isConnected || row.closest("[hidden]")) return;
    void p.favicons?.get(entryFaviconURL(p.config, entry)).then((src) => {
      if (!src || !row.isConnected) return;
      const image = document.createElement("img");
      image.alt = "";
      image.draggable = false;
      image.style.display = "none";
      image.addEventListener("load", () => {
        image.style.display = "";
        fallback.hidden = true;
      });
      image.addEventListener("error", () => {
        image.remove();
        fallback.hidden = false;
      });
      badge.append(image);
      image.src = src;
    });
  });
  const text = element("span", "sb-home-entry");
  text.append(
    element("span", "sb-home-entry-title", entry.title || entry.url),
    element(
      "span",
      "sb-home-entry-url ft__on-surface",
      url.host + url.pathname,
    ),
  );
  link.append(badge, text);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      if (section === "recentlyClosed") void p.reopen(entry as ClosedEntry);
      else void p.open(entry.url, undefined, event.ctrlKey || event.metaKey);
    } else {
      navigate(entry.url);
      if (section === "recentlyClosed")
        p.removeClosed((entry as ClosedEntry).id);
    }
  });
  link.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    if (section === "recentlyClosed") void p.reopen(entry as ClosedEntry);
    else void p.open(entry.url, undefined, true);
  });
  link.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    p.homeEntryMenu(entry, section, event);
  });
  row.append(link);
  const meta =
    section === "mostVisited"
      ? `${entry.visits || 1} ${p.t("visits")}`
      : section === "bookmarks"
        ? ""
        : entryTime(entry.time);
  if (meta) row.append(element("span", "sb-home-meta ft__on-surface", meta));
  if (section !== "mostVisited")
    row.append(
      iconButton(
        "iconClose",
        p.t("delete") + " · " + (entry.title || entry.url),
        () => {
          if (section === "recentlyClosed")
            p.removeClosed((entry as ClosedEntry).id);
          else p.removeEntry(section, entry.url);
        },
      ),
    );
  return row;
}

export function addBookmarkDialog(p: BrowserPlugin) {
  const d = dialog(p.t("addBookmark"));
  const title = element("input", "b3-text-field"),
    url = element("input", "b3-text-field");
  url.placeholder = "https://";
  const error = element("p", "ft__error");
  const form = element("form");
  form.append(
    field(p.t("bookmarkTitle"), title),
    field(p.t("bookmarkURL"), url),
    error,
    button(p.t("cancel"), () => d.dialog.destroy()),
    button(p.t("addBookmark"), () => form.requestSubmit()),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      p.addBookmark(url.value, title.value);
      d.dialog.destroy();
    } catch {
      error.textContent = p.t("invalidBookmarkURL");
    }
  });
  d.body.append(form);
  url.focus();
}
