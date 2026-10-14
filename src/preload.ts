import { ipcRenderer } from "electron";
import { selectedContent } from "./copy-selection";

document.addEventListener(
  "copy",
  (event) => {
    if (!event.isTrusted) return;
    const selection = selectedContent(document);
    if (!selection || selection.html.length > 4 * 1024 * 1024) return;
    // Preserve a useful fallback if conversion in the host fails.
    event.clipboardData?.setData("text/plain", selection.text);
    event.clipboardData?.setData("text/html", selection.html);
    event.preventDefault();
    ipcRenderer.sendToHost("siyuan-browser-copy", selection);
  },
  true,
);
