import { button, dialog, element, confirm } from "../ui";
import type BrowserPlugin from "../index";
import type { UserScript } from "./store";
import type { Metadata } from "./metadata";

export function userScriptManager(plugin: BrowserPlugin) {
  const t = (key: string) => plugin.t(key);
  const d = dialog(t("userScripts"));
  d.body.classList.add("sb-userscripts");
  const message = element("div", "ft__error");
  message.setAttribute("role", "status");
  const list = element("div", "sb-script-list"),
    logs = element("pre", "sb-script-logs");
  let working = false,
    closed = false;
  const api = (action: string, payload?: object) =>
    plugin.adapter.bridge.userScripts(
      plugin.adapter.partition,
      action,
      payload,
    );
  const work = (fn: () => Promise<void>) => {
    if (working) return;
    working = true;
    message.textContent = "";
    void fn()
      .catch((e) => {
        message.textContent = String(e);
      })
      .finally(() => {
        working = false;
      });
  };
  const editor = element("textarea", "b3-text-field sb-script-source");
  editor.rows = 12;
  editor.spellcheck = false;
  editor.setAttribute("aria-label", t("scriptSource"));
  const preview = element("pre", "sb-script-preview");
  let reviewed = "";
  const install = button(t("scriptInstall"), () =>
    work(async () => {
      if (!reviewed || editor.value !== reviewed)
        throw Error(t("scriptReviewFirst"));
      install.disabled = true;
      await api("install", { source: reviewed });
      reviewed = "";
      editor.value = "";
      preview.textContent = t("scriptReloadHint");
      await refresh();
    }),
  );
  install.disabled = true;
  editor.oninput = () => {
    reviewed = "";
    install.disabled = true;
    preview.textContent = "";
  };
  const inspect = button(t("scriptReview"), () =>
    work(async () => {
      const source = editor.value;
      const meta: Metadata = await api("preview", { source });
      if (source !== editor.value) return;
      preview.textContent = [
        meta.name + " " + meta.version,
        meta.description,
        "@match: " + meta.matches.join(", "),
        "@exclude-match: " + meta.excludes.join(", "),
        "@grant: " + meta.grants.join(", "),
        "@run-at: " + meta.runAt,
        ...meta.requires.map((url) => "@require: " + url),
        ...meta.problems,
        t("scriptReplaceHint"),
      ]
        .filter(Boolean)
        .join("\n");
      reviewed = meta.problems.length ? "" : source;
      install.disabled = !reviewed;
    }),
  );
  const file = element("input");
  file.type = "file";
  file.accept = ".js,.user.js";
  file.setAttribute("aria-label", t("scriptImport"));
  file.onchange = () =>
    work(async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      if (selected.size > 1024 * 1024) throw Error("Script exceeds 1 MiB");
      editor.value = await selected.text();
      reviewed = "";
      install.disabled = true;
      preview.textContent = "";
    });
  const sample = button(t("scriptExample"), () => {
    editor.value =
      "// ==UserScript==\n// @name Example page style\n// @namespace siyuan-browser-example\n// @version 1.0\n// @match https://example.com/*\n// @grant GM_addStyle\n// @noframes\n// @run-at document-end\n// ==/UserScript==\nGM_addStyle('h1 { color: #4263eb; }');\n";
    reviewed = "";
    install.disabled = true;
    preview.textContent = "";
  });
  async function refresh() {
    const result: { scripts: Omit<UserScript, "values">[]; logs: any[] } =
      await api("list");
    if (closed || !d.body.isConnected) return;
    list.replaceChildren();
    if (!result.scripts.length)
      list.append(element("p", "ft__on-surface", t("scriptEmpty")));
    for (const script of result.scripts) {
      const row = element("div", "sb-script-row");
      const enabled = element("input", "b3-switch");
      enabled.type = "checkbox";
      enabled.checked = script.enabled;
      enabled.setAttribute(
        "aria-label",
        script.meta.name + " — " + t("scriptEnabled"),
      );
      enabled.onchange = () => {
        const next = enabled.checked;
        enabled.checked = script.enabled;
        work(async () => {
          await api(next ? "enable" : "disable", { id: script.id });
          await refresh();
        });
      };
      row.append(
        element("strong", "", script.meta.name + " " + script.meta.version),
        enabled,
        element("div", "ft__on-surface", script.meta.matches.join(", ")),
        element("div", "ft__on-surface", script.meta.grants.join(", ")),
        button(t("scriptViewSource"), () => {
          editor.value = script.source;
          reviewed = "";
          install.disabled = true;
          preview.textContent = script.dependencies
            .map((dep) => dep.url + "\nSHA-256 " + dep.sha256)
            .join("\n");
          editor.focus();
        }),
        button(t("scriptClearData"), () =>
          confirm(t("scriptClearData"), script.meta.name, () =>
            work(async () => {
              await api("clear", { id: script.id });
              await refresh();
            }),
          ),
        ),
        button(t("scriptRemove"), () =>
          confirm(
            t("scriptRemove"),
            t("scriptRemoveHint") + " " + script.meta.name,
            () =>
              work(async () => {
                await api("remove", { id: script.id });
                await refresh();
              }),
          ),
        ),
      );
      list.append(row);
    }
    logs.textContent =
      result.logs
        .map(
          (log) =>
            new Date(log.time).toLocaleTimeString() +
            " · " +
            log.name +
            " · " +
            log.message +
            "\n" +
            log.url,
        )
        .join("\n\n") || t("scriptNoLogs");
  }
  d.body.append(
    element("p", "", t("scriptScope")),
    element("p", "ft__on-surface", t("scriptReloadHint")),
    message,
    list,
    element("h3", "", t("scriptImport")),
    file,
    sample,
    editor,
    inspect,
    preview,
    install,
    element("h3", "", t("scriptLogs")),
    button(t("scriptRefresh"), () => work(refresh)),
    logs,
    button(t("close"), () => {
      closed = true;
      d.dialog.destroy();
    }),
  );
  work(refresh);
}
