import { httpURL } from "./core";

/** Mirror the host's icon refresh without rebuilding the tree or losing selection. */
export class DocumentIconRefresh {
  private pending = new Map<
    string,
    { icon: string; timer: ReturnType<typeof setTimeout> }
  >();
  private observer?: MutationObserver;
  update(id: string, icon: string) {
    if (!/^\d{14}-[a-z0-9]{7}$/.test(id) || !httpURL(icon)) return;
    clearTimeout(this.pending.get(id)?.timer);
    this.pending.set(id, {
      icon,
      timer: setTimeout(() => {
        this.pending.delete(id);
        if (!this.pending.size) {
          this.observer?.disconnect();
          this.observer = undefined;
        }
      }, 10000),
    });
    this.paint();
    if (!this.observer) {
      this.observer = new MutationObserver(() => this.paint());
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  }
  private paint() {
    for (const [id, { icon }] of this.pending) {
      for (const row of document.querySelectorAll<HTMLElement>(
        `[data-node-id="${id}"]`,
      )) {
        const holder = Array.from(row.children).find((child) =>
          child.classList.contains("b3-list-item__icon"),
        );
        if (!holder) continue;
        row.removeAttribute("data-default-icon");
        const previous = holder.firstElementChild;
        if (
          holder.childElementCount === 1 &&
          previous?.tagName === "IMG" &&
          previous.getAttribute("src") === icon
        )
          continue;
        const img = document.createElement("img");
        img.src = icon;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        holder.replaceChildren(img);
      }
    }
  }
  dispose() {
    this.observer?.disconnect();
    this.observer = undefined;
    for (const entry of this.pending.values()) clearTimeout(entry.timer);
    this.pending.clear();
  }
}
