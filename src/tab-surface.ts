/** Keep Electron guests connected while SiYuan reparents native tab panels. */
export class TabSurface {
  readonly element: HTMLDivElement;
  private mutations: MutationObserver;
  private resize: ResizeObserver;
  private scheduled = false;
  private disposed = false;
  private schedule = () => {
    if (this.disposed || this.scheduled) return;
    this.scheduled = true;
    // rAF is suspended in occluded host windows. Visibility still must track
    // native tab switches there, before the window becomes visible again.
    queueMicrotask(() => {
      this.scheduled = false;
      this.sync();
    });
  };
  private win: Window;

  constructor(private anchor: HTMLElement) {
    const doc = anchor.ownerDocument;
    this.win = doc.defaultView!;
    anchor.classList.add("sb-browser-anchor");
    this.element = doc.createElement("div");
    this.element.className = "sb-browser sb-tab-surface";
    this.element.style.visibility = "hidden";
    doc.body.append(this.element);
    this.mutations = new MutationObserver((records) => {
      // Our own layout writes and page UI must not start an observer loop.
      if (
        records.some((r) => !(r.target as Element).closest?.(".sb-tab-surface"))
      )
        this.schedule();
    });
    this.mutations.observe(doc.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    this.resize = new ResizeObserver(this.schedule);
    this.resize.observe(anchor);
    this.win.addEventListener("resize", this.schedule);
    doc.addEventListener("scroll", this.schedule, true);
    this.sync();
  }

  sync() {
    if (this.disposed) return;
    const rect = this.anchor.getBoundingClientRect();
    const visible =
      this.anchor.isConnected &&
      this.anchor.getClientRects().length > 0 &&
      rect.width > 0 &&
      rect.height > 0 &&
      this.win.getComputedStyle(this.anchor).visibility !== "hidden";
    this.element.style.visibility = visible ? "" : "hidden";
    this.element.inert = !visible;
    if (!visible) return;
    Object.assign(this.element.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  destroy() {
    this.disposed = true;
    this.mutations.disconnect();
    this.resize.disconnect();
    this.win.removeEventListener("resize", this.schedule);
    this.anchor.ownerDocument.removeEventListener(
      "scroll",
      this.schedule,
      true,
    );
    this.element.remove();
    this.anchor.classList.remove("sb-browser-anchor");
  }
}

/** Shield guests at drag START, before the pointer can enter a guest renderer. */
export function watchTabDrag(doc: Document): () => void {
  const win = doc.defaultView!;
  const clear = () => doc.body.classList.remove("sb-tab-dragging");
  const start = (event: DragEvent) => {
    const target = event.target as Element | null;
    if (target?.closest?.('.layout-tab-bar [data-type="tab-header"]'))
      doc.body.classList.add("sb-tab-dragging");
  };
  const enter = (event: DragEvent) => {
    // Also support a tab dragged in from another SiYuan window.
    if (
      Array.from(event.dataTransfer?.types || []).includes(
        "application/siyuan-tab",
      )
    )
      doc.body.classList.add("sb-tab-dragging");
  };
  const end = () => queueMicrotask(clear);
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape") clear();
  };
  doc.addEventListener("dragstart", start, true);
  doc.addEventListener("dragenter", enter, true);
  doc.addEventListener("dragend", end, true);
  doc.addEventListener("drop", end, true);
  doc.addEventListener("pointerdown", clear, true);
  doc.addEventListener("keydown", key, true);
  win.addEventListener("blur", clear);
  return () => {
    clear();
    doc.removeEventListener("dragstart", start, true);
    doc.removeEventListener("dragenter", enter, true);
    doc.removeEventListener("dragend", end, true);
    doc.removeEventListener("drop", end, true);
    doc.removeEventListener("pointerdown", clear, true);
    doc.removeEventListener("keydown", key, true);
    win.removeEventListener("blur", clear);
  };
}
