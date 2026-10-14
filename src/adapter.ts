declare const DESKTOP_FILENAME: string;
export class DesktopBrowserAdapter {
  bridge: any;
  partition = "";
  owner = 0;
  remote: any;
  reason = "";
  constructor(public workspace: string, notify: (event: any) => void) {
    try {
      this.remote = window.require("@electron/remote");
      const host = this.remote.getCurrentWebContents();
      if (!host.getLastWebPreferences().webviewTag)
        throw Error("远程内核或当前宿主禁止网页视图，请使用系统浏览器。");
      this.owner = host.id;
      const path = window.require("node:path");
      this.bridge = this.remote.require(
        path.join(
          workspace,
          "data",
          "plugins",
          "siyuan-browser",
          DESKTOP_FILENAME,
        ),
      );
      this.partition = this.bridge.acquire(
        workspace,
        this.owner,
        location.origin,
        notify,
      ).partition;
    } catch (e) {
      this.reason = String(e);
    }
  }
  create(archive?: { partition: string; url: string }): any {
    if (!this.partition) throw Error(this.reason);
    const view = document.createElement("webview");
    view.setAttribute("partition", archive?.partition || this.partition);
    view.setAttribute("preload", window.require("node:url").pathToFileURL(
      window.require("node:path").join(this.workspace, "data/plugins/siyuan-browser/copy-preload.cjs"),
    ).href);
    view.setAttribute(
      "webpreferences",
      "contextIsolation=yes,sandbox=yes,nodeIntegration=no,nodeIntegrationInSubFrames=no,webSecurity=yes,allowRunningInsecureContent=no" +
        (archive ? ",javascript=no" : ""),
    );
    if (!archive) view.setAttribute("allowpopups", "");
    view.setAttribute("src", archive?.url || "about:blank");
    view.className = "sb-webview";
    return view;
  }
  external(url: string) {
    if (/^https?:\/\//i.test(url))
      window.require("electron").shell.openExternal(url);
  }
  hostZoom(): number {
    return window.require("electron").webFrame.getZoomFactor();
  }
  async close() {
    if (this.partition) await this.bridge.release(this.partition, this.owner);
  }
}
declare global {
  interface Window {
    require: any;
    siyuan: any;
    Lute: any;
  }
}
