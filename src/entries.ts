import type { Entry, ClosedEntry, HomeSection } from "./core";
import { element, button, plainIconButton, dialog, field } from "./ui";
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

/** One home row: favicon, title over host name, a right-aligned meta cell and a
 * delete action. The row is rendered inside the page's shadow root, so it uses
 * plugin classes only and never picks up a theme's list styling. */
export function entryRow(
  p: BrowserPlugin,
  entry: Entry,
  section: HomeSection,
  navigate: (url: string) => void,
) {
  const row = element("li", "row");
  const link = element("a", "row-link");
  link.href = entry.url;
  link.title = entry.url;
  const url = new URL(entry.url);
  const site = element("span", "site");
  const fallback = element(
    "span",
    "letter",
    url.hostname
      .replace(/^www\./, "")
      .slice(0, 1)
      .toUpperCase(),
  );
  site.append(fallback);
  site.setAttribute("aria-hidden", "true");
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
      site.append(image);
      image.src = src;
    });
  });
  const body = element("span", "body");
  const title = element("span", "title", entry.title || entry.url);
  const label = element("span", "url", url.host + url.pathname);
  body.append(title, label);
  link.append(site, body);
  // Bookmarks are edited in place: the label and the address both turn into
  // fields, and while they are open the row must not navigate. Stopping
  // propagation is not enough - a click inside an <a> still runs the link's own
  // activation behaviour - so the fields cancel the click as well.
  const editing = () => Boolean(link.querySelector(".bookmark-edit"));
  const edit = (draft?: { title: string; url: string }) => {
    if (!title.isConnected || editing()) return;
    const inputs = [element("input", "bookmark-edit title-edit"), element("input", "bookmark-edit url-edit")];
    const [name, target] = inputs;
    name.value = draft?.title ?? entry.title ?? "";
    target.value = draft?.url ?? entry.url;
    name.spellcheck = false;
    target.spellcheck = false;
    name.setAttribute("aria-label", p.t("bookmarkTitle"));
    target.setAttribute("aria-label", p.t("bookmarkURL"));
    target.inputMode = "url";
    let done = false;
    const active = () => {
      const root = row.getRootNode() as Document | ShadowRoot;
      return root.activeElement;
    };
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      const next = { title: name.value.trim(), url: target.value.trim() };
      name.replaceWith(title);
      target.replaceWith(label);
      if (!save || (next.title === entry.title && next.url === entry.url))
        return;
      const result = p.editBookmark(entry.url, next);
      if (result === "empty-title") {
        p.notify(p.t("emptyBookmarkTitle"));
        edit(next);
      } else if (result === "invalid-url") {
        p.notify(p.t("invalidBookmarkURL"));
        edit(next);
      } else if (result === "duplicate") {
        p.notify(p.t("duplicateBookmark"));
        edit(next);
      }
    };
    for (const input of inputs) {
      for (const type of ["click", "dblclick", "mousedown", "auxclick"])
        input.addEventListener(type, (event) => {
          event.stopPropagation();
          // Cancelling the click keeps the caret click from following the href.
          if (type === "click") event.preventDefault();
        });
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      });
      // Moving from one field to the other is not a commit; leaving both is.
      input.addEventListener("blur", () => {
        setTimeout(() => {
          if (!done && active() !== name && active() !== target) finish(true);
        });
      });
    }
    title.replaceWith(name);
    label.replaceWith(target);
    name.focus();
    name.select();
  };
  link.addEventListener("click", (event) => {
    event.preventDefault();
    if (editing()) return;
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
    if (editing()) return;
    if (section === "recentlyClosed") void p.reopen(entry as ClosedEntry);
    else void p.open(entry.url, undefined, true);
  });
  row.append(link);
  const meta =
    section === "mostVisited"
      ? `${entry.visits || 1} ${p.t("visits")}`
      : section === "bookmarks"
        ? ""
        : entryTime(entry.time);
  // The meta cell is always rendered and ends on the row's right edge: sections
  // then share one column edge, so the dates and the visit counts close on the
  // same line in every section.
  row.append(element("span", "meta", meta));
  // Hover actions live in one cluster pinned to the row's right edge: a
  // bookmark gets an edit button before its delete button, and the rest of the
  // sections get only the delete button. The row reserves the cluster's width
  // as padding, so its absence never moves the timestamp.
  const actions = element("span", "row-actions");
  if (section === "bookmarks")
    actions.append(
      plainIconButton(
        "iconEdit",
        p.t("editBookmark") + " · " + (entry.title || entry.url),
        () => edit(),
      ),
    );
  if (section !== "mostVisited")
    actions.append(
      plainIconButton(
        "iconClose",
        p.t("delete") + " · " + (entry.title || entry.url),
        () => {
          if (section === "recentlyClosed")
            p.removeClosed((entry as ClosedEntry).id);
          else p.removeEntry(section, entry.url);
        },
      ),
    );
  if (actions.childElementCount) row.append(actions);
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
