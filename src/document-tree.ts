import { api } from "./api";
import { element, button } from "./ui";

export interface TreeDestination {
  notebook: string;
  id?: string;
  label: string;
}
/** Load only expanded branches; selection is independent of expansion. */
export function documentTree(
  notebooks: { id: string; name: string; closed?: boolean }[],
  preferred: string,
  changed: (value: TreeDestination) => void,
  t: (key: string) => string,
  restorePath?: string,
) {
  const root = element("div", "sb-destination-tree");
  root.setAttribute("role", "tree");
  root.setAttribute("aria-label", t("savePath"));
  let selected: HTMLElement | undefined;
  let userSelected = false;
  function node(
    value: TreeDestination,
    name: string,
    path: string,
    expandable: boolean,
    depth: number,
  ) {
    const wrap = element("div");
    const row = element("div", "sb-destination-row");
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-selected", "false");
    row.style.paddingLeft = `${depth * 18}px`;
    const children = element("div");
    children.setAttribute("role", "group");
    children.hidden = true;
    let loaded = false,
      loading = false;
    const select = (automatic = false) => {
      if (automatic && userSelected) return;
      if (!automatic) userSelected = true;
      selected?.setAttribute("aria-selected", "false");
      row.setAttribute("aria-selected", "true");
      selected = row;
      changed(value);
    };
    const toggle = button("▸", () => void expand());
    toggle.className = "sb-tree-toggle";
    toggle.setAttribute("aria-label", t("expandDocuments"));
    toggle.disabled = !expandable;
    if (!expandable) toggle.style.visibility = "hidden";
    const label = button((value.id ? "📄 " : "📓 ") + name, () => select());
    label.className = "sb-tree-label";
    label.title = value.label;
    async function expand() {
      if (!expandable || loading) return;
      if (!children.hidden) {
        children.hidden = true;
        row.setAttribute("aria-expanded", "false");
        toggle.textContent = "▸";
        return;
      }
      children.hidden = false;
      row.setAttribute("aria-expanded", "true");
      toggle.textContent = "▾";
      if (loaded) return;
      loading = true;
      children.replaceChildren(
        element("div", "ft__on-surface", t("loadingDocuments")),
      );
      try {
        const result = await api<{
          files: {
            id: string;
            name: string;
            path: string;
            subFileCount: number;
          }[];
        }>("filetree/listDocsByPath", { notebook: value.notebook, path });
        children.replaceChildren();
        for (const doc of result.files || []) {
          const child = node(
            {
              notebook: value.notebook,
              id: doc.id,
              label: value.label + "/" + doc.name,
            },
            doc.name,
            doc.path,
            doc.subFileCount > 0,
            depth + 1,
          );
          children.append(child.wrap);
          if (value.notebook === preferred && restorePath && !userSelected) {
            if (doc.path === restorePath) child.select(true);
            else if (
              restorePath.startsWith(doc.path.replace(/\.sy$/, "") + "/")
            )
              void child.expand();
          }
        }
        if (!result.files?.length)
          children.append(
            element("div", "ft__on-surface", t("noChildDocuments")),
          );
        loaded = true;
      } catch (e) {
        children.replaceChildren(element("div", "ft__error", String(e)));
        // Collapse then expand to retry.
      } finally {
        loading = false;
      }
    }
    if (expandable) row.setAttribute("aria-expanded", "false");
    row.append(toggle, label);
    wrap.append(row, children);
    return { wrap, select, expand };
  }
  const opened = notebooks.filter((n) => !n.closed);
  for (const notebook of opened) {
    const item = node(
      { notebook: notebook.id, label: notebook.name },
      notebook.name,
      "/",
      true,
      0,
    );
    root.append(item.wrap);
    if (
      notebook.id ===
      (opened.find((n) => n.id === preferred)?.id || opened[0]?.id)
    ) {
      item.select(true);
      void item.expand();
    }
  }
  return root;
}
