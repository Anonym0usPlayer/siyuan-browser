import { ipcRenderer, contextBridge, webFrame } from "electron";
import type { Metadata } from "./metadata";
// Keep channels literal here: never bundle the main-process service into preload.
const channel = "siyuan-browser-userscripts-v1",
  commands = "siyuan-browser-userscript-command-v1";
export function installUserScripts() {
  if (window.top !== window) return;
  const callbacks = new Map<string, Map<number, () => unknown>>();
  const revoked = new Set<string>();
  ipcRenderer.on(commands, (_event: unknown, payload: any) => {
    if (payload?.revoke) {
      revoked.add(payload.revoke);
      callbacks.delete(payload.revoke);
      return;
    }
    const callback = callbacks.get(payload?.token)?.get(payload?.id);
    if (callback)
      void Promise.resolve()
        .then(callback)
        .catch((e) => report(payload.token, String(e)));
  });
  const invoke = (token: string, op: string, data: object = {}) => {
    if (revoked.has(token))
      return Promise.reject(Error("Userscript disabled; reload page"));
    return ipcRenderer.invoke(channel, { ...data, token, op });
  };
  const report = (token: string, message: string) =>
    invoke(token, "report", { message }).catch(() => {});
  async function run() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const plans: {
        token: string;
        source: string;
        meta: Metadata;
        dependencies: string[];
      }[] = await ipcRenderer.invoke(channel, { op: "plans" });
      for (const [index, plan] of plans.entries()) {
        const execute = () => {
          if (revoked.has(plan.token)) return;
          const none = plan.meta.grants.includes("none"),
            world = none ? 0 : 1000 + index;
          const api: Record<string, any> = {};
          const storage: Record<string, any> = {};
          for (const op of [
            "getValue",
            "setValue",
            "deleteValue",
            "listValues",
          ])
            if (plan.meta.grants.includes("GM." + op))
              storage[op] = (key?: string, value?: unknown) =>
                invoke(plan.token, op, { key, value });
          if (plan.meta.grants.includes("GM.openInTab"))
            storage.openInTab = (url: string, options?: { active?: boolean }) =>
              invoke(plan.token, "openInTab", {
                url,
                background: options?.active === false,
              });
          if (Object.keys(storage).length) api.GM = storage;
          if (plan.meta.grants.includes("GM_registerMenuCommand")) {
            const handlers = new Map<number, () => unknown>();
            callbacks.set(plan.token, handlers);
            api.GM_registerMenuCommand = (label: string, fn: () => unknown) => {
              if (typeof fn !== "function" || handlers.size >= 20)
                throw Error("Invalid menu command");
              const id = handlers.size + 1;
              handlers.set(id, fn);
              void invoke(plan.token, "registerMenuCommand", {
                id,
                label,
              }).catch((e: unknown) => report(plan.token, String(e)));
              return id;
            };
          }
          try {
            if (!none) {
              if (typeof contextBridge.exposeInIsolatedWorld !== "function")
                throw Error("Host lacks isolated-world bridge support");
              contextBridge.exposeInIsolatedWorld(
                world,
                "__siyuanUserScript",
                api,
              );
            }
            const info = {
              script: {
                name: plan.meta.name,
                namespace: plan.meta.namespace,
                version: plan.meta.version,
                description: plan.meta.description,
                matches: plan.meta.matches,
                excludes: plan.meta.excludes,
                grants: plan.meta.grants,
                "run-at": plan.meta.runAt,
              },
              scriptHandler: "SiYuan Browser",
              version: "1",
            };
            const locals = none
              ? ""
              : [
                  Object.keys(storage).length
                    ? "const GM = globalThis.__siyuanUserScript.GM;"
                    : "",
                  api.GM_registerMenuCommand
                    ? "const GM_registerMenuCommand = globalThis.__siyuanUserScript.GM_registerMenuCommand;"
                    : "",
                  plan.meta.grants.includes("GM_info")
                    ? "const GM_info = " + JSON.stringify(info) + ";"
                    : "",
                  plan.meta.grants.includes("GM_addStyle")
                    ? "const GM_addStyle = (css) => { const s=document.createElement('style'); s.textContent=String(css); (document.head||document.documentElement).appendChild(s); return s; };"
                    : "",
                ].join("\n");
            const code =
              "(async function(){\n" +
              locals +
              "\n" +
              plan.dependencies.join("\n;\n") +
              "\n;\n" +
              plan.source +
              "\n}).call(globalThis)\n//# sourceURL=siyuan-userscript-" +
              index +
              ".js";
            void webFrame
              .executeJavaScriptInIsolatedWorld(world, [{ code }])
              .then(
                () => report(plan.token, "Completed"),
                (e: unknown) => report(plan.token, "Error: " + String(e)),
              );
          } catch (e) {
            void report(plan.token, "Error: " + String(e));
          }
        };
        if (plan.meta.runAt === "document-idle") {
          if (document.readyState === "complete") setTimeout(execute, 0);
          else
            window.addEventListener("load", () => setTimeout(execute, 0), {
              once: true,
            });
        } else execute();
      }
    } catch (e) {
      console.warn("[SiYuan Browser userscripts]", String(e));
    }
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => void run(), {
      once: true,
    });
  else void run();
}
