/** Replace only this custom tab's leading graphic; leave its close button intact. */
export function setTabFavicon(head: HTMLElement, src?: string) {
  head.querySelector(".sb-tab-favicon")?.remove();
  const fallback = head.querySelector<SVGElement>(
    ":scope > .item__graphic:not(.sb-tab-spinner)",
  );
  if (fallback) fallback.style.display = src ? "none" : "";
  if (!src) return;
  const image = document.createElement("img");
  image.className = "item__graphic sb-tab-favicon";
  image.src = src;
  image.alt = "";
  image.draggable = false;
  const text = head.querySelector(".item__text");
  if (text) text.before(image);
  else head.prepend(image);
}

/** Temporarily replace the graphic without discarding a favicon arriving mid-load. */
export function setTabLoading(head: HTMLElement, loading: boolean, label = "") {
  head.classList.toggle("sb-tab-loading", loading);
  const existing = head.querySelector<HTMLElement>(".sb-tab-spinner");
  if (!loading) {
    existing?.remove();
    head.removeAttribute("aria-busy");
    return;
  }
  head.setAttribute("aria-busy", "true");
  const spinner = existing || document.createElement("span");
  spinner.className = "item__graphic sb-tab-spinner";
  spinner.setAttribute("role", "status");
  spinner.setAttribute("aria-label", label);
  spinner.title = label;
  if (!existing) {
    const text = head.querySelector(".item__text");
    if (text) text.before(spinner);
    else head.prepend(spinner);
  }
}
