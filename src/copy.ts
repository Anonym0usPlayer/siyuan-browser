import { extract, markdown } from "./content";

import type { CopySelection } from "./copy-selection";

export function enhancedClipboard(selection: CopySelection, lute: any) {
  const article = extract(selection.html, selection.url, "", true);
  const md = markdown(article.html, article.url);
  if (!md.trim()) throw Error("Empty converted selection");
  const blockDOM = lute.Md2BlockDOM(md);
  const bytes = new TextEncoder().encode(blockDOM);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // SiYuan's native clipboard envelope; survives Electron/OS MIME filtering.
  return {
    text: selection.text,
    html: `<!--data-siyuan='${btoa(binary)}'-->${lute.BlockDOM2HTML(blockDOM)}`,
    blockDOM,
  };
}
