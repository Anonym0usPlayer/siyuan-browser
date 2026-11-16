/** Which light/dark mode SiYuan itself is showing.
 *
 * The host writes the resolved mode onto `<html data-theme-mode>` whenever it
 * applies a theme, and it already resolves "follow the system" for us: what
 * lands there is the mode the workspace is actually painted in. That is the
 * value a guest page should answer `prefers-color-scheme` with — Electron and
 * Chromium answer it from the OS appearance instead, which is a different
 * question and disagrees whenever SiYuan is pinned to a theme.
 */
export function appearanceMode(doc: Document): "dark" | "light" {
  const attr = doc.documentElement?.getAttribute("data-theme-mode");
  if (attr === "dark" || attr === "light") return attr;
  // Older hosts only carry the setting itself: `appearance.mode` is 0 light,
  // 1 dark, and `modeOS` means the attribute is expected to exist by now.
  const mode = (doc.defaultView as any)?.siyuan?.config?.appearance?.mode;
  return mode === 1 ? "dark" : "light";
}

/** Report the mode now and on every later theme change, including the switch
 * from a light theme to a dark one while the OS stays where it was. Returns a
 * disposer, since the observer outlives a plugin reload otherwise. */
export function watchAppearance(
  doc: Document,
  apply: (mode: "dark" | "light") => void,
) {
  let last: "dark" | "light" | undefined;
  const run = () => {
    const mode = appearanceMode(doc);
    if (mode === last) return;
    last = mode;
    apply(mode);
  };
  run();
  const observer = new MutationObserver(run);
  observer.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme-mode"],
  });
  return () => observer.disconnect();
}
