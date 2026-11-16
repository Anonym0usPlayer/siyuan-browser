import { httpURL } from "./core";

/** Clicks that already belong to someone else: the editor fires the host's own
 * `open-link` event for its links, the browser surface runs its own router, and
 * fields and editable nodes own their pointer events. */
const OWNED =
  ".protyle, .sb-tab-surface, .sb-dialog, input, textarea, [contenteditable='true']";

/**
 * Take over a link that SiYuan's own chrome renders.
 *
 * The Bazaar — its package cards and the README pane inside them — draws plain
 * anchors and deliberately returns early on them (`bindBazaarClickEvent` skips
 * any `<A>`), so their clicks never reach the editor's `open-link` event; the
 * host turns them into a new window for the system browser instead. The capture
 * phase is the only place a plugin can take them: `preventDefault` stops the
 * anchor before Electron is asked to open a window, and the address goes to a
 * browser tab like any other link.
 *
 * Returns whether the click was taken, so callers can stay dumb about it.
 */
export function takeoverUILink(event: MouseEvent, open: (url: string) => void) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return false;
  const target = event.target as Element | null;
  const anchor = target?.closest?.("a[href]");
  if (!anchor || anchor.closest(OWNED)) return false;
  const href =
    (anchor as HTMLAnchorElement).href || anchor.getAttribute("href") || "";
  if (!httpURL(href)) return false;
  event.preventDefault();
  event.stopPropagation();
  open(href);
  return true;
}
