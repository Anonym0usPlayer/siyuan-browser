import { Dialog } from "siyuan";
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}
export function button(text: string, fn: () => void, title = text) {
  const b = element("button", "b3-button b3-button--outline", text);
  b.type = "button";
  b.title = title;
  b.addEventListener("click", (event) => {
    event.stopPropagation();
    fn();
    // The host paints a focus ring on the pressed button, which reads as a
    // stuck toggle until the user clicks empty space. Pointer activation
    // releases it; keyboard activation (detail 0) keeps focus for a11y.
    if (event.detail > 0) b.blur();
  });
  return b;
}
const thinPaths: Record<string, string> = {
  collapse: "m6 15 6-6 6 6",
  back: "M19 12H5m7-7-7 7 7 7",
  forward: "M5 12h14m-7-7 7 7-7 7",
  reload: "M20 7v5h-5M20 12a8 8 0 1 0-2 6",
  stop: "m6 6 12 12M18 6 6 18",
  iconBrowserHome: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8",
  iconAlignLeft: "M4 5h16M4 10h11M4 15h16M4 20h11",
  iconDownload: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  iconBookmark: "M6 3h12v18l-6-4-6 4Z",
  iconHistory: "M3 4v5h5M3 9a9 9 0 1 1 0 6M12 7v5l3 2",
};
export function icon(name: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("sb-icon");
  if (thinPaths[name]) {
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.style.fill = "none";
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", thinPaths[name]);
    svg.append(path);
    return svg;
  }
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#" + name);
  svg.append(use);
  return svg;
}
export function iconButton(name: string, title: string, fn: () => void) {
  const b = button("", fn, title);
  b.classList.add("sb-icon-button");
  b.setAttribute("aria-label", title);
  b.append(icon(name));
  return b;
}
export function dialog(
  title: string,
  onClose?: () => void,
): { dialog: Dialog; body: HTMLElement } {
  const d = new Dialog({
    title,
    content: '<div class="sb-dialog"></div>',
    width: "620px",
    destroyCallback: onClose,
  });
  return { dialog: d, body: d.element.querySelector(".sb-dialog")! };
}
export function confirm(title: string, message: string, fn: () => void) {
  const d = dialog(title);
  d.body.append(
    element("p", "", message),
    button("取消 / Cancel", () => d.dialog.destroy()),
    button("确认 / Confirm", () => {
      d.dialog.destroy();
      fn();
    }),
  );
}
export function field(label: string, input: HTMLElement) {
  const row = element("label", "sb-field");
  row.append(element("span", "", label), input);
  return row;
}
