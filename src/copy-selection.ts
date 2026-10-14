export interface CopySelection {
  html: string;
  text: string;
  url: string;
}

/** Keep the range's containing semantic block (e.g. a heading or code block),
 * without including any unselected siblings. Runs in both guest and reader DOM. */
export function selectedContent(
  root: Document | HTMLElement,
): CopySelection | null {
  const doc = root.ownerDocument || (root as Document);
  const active = doc.activeElement;
  if (
    active?.closest(
      'input,textarea,[contenteditable]:not([contenteditable="false"])',
    )
  )
    return null;
  const selection = doc.defaultView?.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const holder = doc.createElement("div");
  let fragment: Node = range.cloneContents();
  let ancestor =
    range.commonAncestorContainer.nodeType === 1
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  while (ancestor && ancestor !== root && ancestor !== doc.body) {
    const wrapper = ancestor.cloneNode(false);
    wrapper.appendChild(fragment);
    fragment = wrapper;
    if (ancestor.matches("p,h1,h2,h3,h4,h5,h6,pre,blockquote,ul,ol,table"))
      break;
    ancestor = ancestor.parentElement;
  }
  holder.append(fragment);
  return {
    html: holder.innerHTML,
    text: selection.toString(),
    url: doc.location.href,
  };
}
