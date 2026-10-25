/* Runs in Electron's main process through @electron/remote.require.
 * All hooks are scoped to plugin partitions. No host/default session mutation. */
import { app, session, webContents, clipboard, nativeImage } from "electron";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FiltersEngine, Request } from "@ghostery/adblocker";
import { httpURL, internalPageFromGuest } from "./core";
import { loadFilters, normalizeFilters, atomicJSON } from "./filter-store";
const registry = globalThis as typeof globalThis & {
  __siyuanBrowserSessions?: Map<string, any>;
};
const states = (registry.__siyuanBrowserSessions ??= new Map<string, any>());
let filterWrite: Promise<any> = Promise.resolve();
export async function filterSettings(fallback: any) {
  return loadFilters(
    path.join(app.getPath("userData"), "siyuan-browser-settings.json"),
    fallback,
  );
}
const hash = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 24);
/** The project site easylist.to frequently stalls on slow routes, while the
 * official download host serves the same lists without redirecting. Existing
 * configs keep their URL; only the transfer falls back. */
const MIRRORS: Record<string, string> = {
  "https://easylist.to/easylist/easylist.txt":
    "https://easylist-downloads.adblockplus.org/easylist.txt",
  "https://easylist.to/easylist/easyprivacy.txt":
    "https://easylist-downloads.adblockplus.org/easyprivacy.txt",
};
export function acquire(
  workspace: string,
  owner: number,
  kernelOrigin: string,
  notify: (event: any) => void,
) {
  const partition = "persist:siyuan-browser-" + hash(path.resolve(workspace));
  let s = states.get(partition);
  if (s?.owners.has(owner)) {
    // A renderer reload keeps its host id but invalidates its callbacks.
    void release(partition, owner);
    s = states.get(partition);
  }
  if (!s) {
    const ses = session.fromPartition(partition);
    s = {
      partition,
      ses,
      kernelPort: new URL(kernelOrigin).port || "80",
      owners: new Map(),
      ownerDestroyed: new Map(),
      guests: new Set(),
      filterOverrides: new Map(),
      engine: null,
      enabled: true,
      timer: null,
      abort: new AbortController(),
      archives: new Set(),
    };
    states.set(partition, s);
    ses.setPermissionRequestHandler((_w: any, _p: any, cb: any) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    ses.webRequest.onBeforeRequest(
      { urls: ["<all_urls>"] },
      (d: any, cb: any) => {
        let protectedKernel = false;
        try {
          const u = new URL(d.url);
          protectedKernel = u.port === s.kernelPort || u.port === "6806";
        } catch {}
        if (protectedKernel) return cb({ cancel: true });
        const allowed =
          httpURL(d.url) ||
          d.url === "about:blank" ||
          !!internalPageFromGuest(d.url) ||
          /^(data|blob):/.test(d.url);
        if (!allowed) return cb({ cancel: true });
        if (
          (s.filterOverrides.get(d.webContentsId) ?? s.enabled) &&
          s.engine &&
          d.resourceType !== "mainFrame"
        ) {
          const r = Request.fromRawDetails({
            url: d.url,
            sourceUrl: d.referrer || "",
            type: d.resourceType,
          });
          return cb({ cancel: s.engine.match(r).match });
        }
        cb({});
      },
    );
    s.download = (_e: any, item: any, w: any) => {
      if (!w || !s.guests.has(w.id)) return;
      item.setSaveDialogOptions({
        title: "Save download",
        defaultPath: path.basename(item.getFilename()),
      });
      item.once("done", (_event: any, state: string) => {
        const callback = s.owners.get(w.hostWebContents?.id);
        if (callback)
          callback({ type: "download", state, name: item.getFilename() });
      });
    };
    ses.on("will-download", s.download);
    s.created = (_e: any, w: any) => {
      if (w.session !== ses) return;
      s.guests.add(w.id);
      w.setWindowOpenHandler((d: any) => {
        if (httpURL(d.url))
          send(w, {
            type: "popup",
            url: d.url,
            background: d.disposition === "background-tab",
          });
        return { action: "deny" };
      });
      const nav = (e: any, url: string) => {
        if (
          !httpURL(url) &&
          url !== "about:blank" &&
          !internalPageFromGuest(url)
        )
          e.preventDefault();
      };
      w.on("will-navigate", nav);
      w.on("will-redirect", nav);
      w.on("will-attach-webview", (e: any) => e.preventDefault());
      w.on("before-input-event", (e: any, input: any) => {
        if (
          (input.control || input.meta) &&
          input.type === "keyDown" &&
          ![
            "c",
            "x",
            "v",
            "a",
            "z",
            "y",
            "arrowleft",
            "arrowright",
            "arrowup",
            "arrowdown",
            "backspace",
            "delete",
          ].includes(input.key.toLowerCase())
        ) {
          e.preventDefault();
          send(w, { type: "key", input });
        }
      });
      w.on("dom-ready", () => {
        if (
          !(s.filterOverrides.get(w.id) ?? s.enabled) ||
          !s.engine ||
          !httpURL(w.getURL())
        )
          return;
        try {
          const u = new URL(w.getURL());
          const c = s.engine.getCosmeticsFilters({
            url: u.href,
            hostname: u.hostname,
            domain: u.hostname,
            getInjectionRules: false,
            getExtendedRules: false,
          });
          if (c.styles) void w.insertCSS(c.styles).catch(() => {});
        } catch {}
      });
      w.on("destroyed", () => {
        s.guests.delete(w.id);
        s.filterOverrides.delete(w.id);
      });
    };
    function send(w: any, event: any) {
      const callback = s.owners.get(w.hostWebContents?.id);
      if (callback) callback({ ...event, id: w.id });
    }
    app.on("web-contents-created", s.created);
  }
  s.ownerDestroyed ??= new Map();
  if (!s.owners.has(owner)) {
    const host = webContents.fromId(owner);
    if (host) {
      const cleanup = () => void release(partition, owner);
      s.ownerDestroyed.set(owner, cleanup);
      host.once("destroyed", cleanup);
    }
  }
  s.owners.set(owner, notify);
  return { partition };
}
export async function configure(partition: string, config: any, force = false) {
  const settings = normalizeFilters(config);
  filterWrite = filterWrite
    .catch(() => {})
    .then(() =>
      atomicJSON(
        path.join(app.getPath("userData"), "siyuan-browser-settings.json"),
        settings,
      ),
    );
  await filterWrite;
  for (const s of states.values()) {
    s.enabled = settings.adblock;
    clearInterval(s.timer);
  }
  const cache = path.join(
    app.getPath("userData"),
    "siyuan-browser-filters.json",
  );
  type ListCache = Record<string, { text: string; time: number }>;
  const applyText = (text: string) => {
    const engine = FiltersEngine.parse(text);
    for (const s of states.values()) s.engine = engine;
    return engine;
  };
  /** A single list may be several megabytes on a slow link: try the configured
   * URL, fall back to the official mirror, and report timeouts as such instead
   * of a bare AbortError. */
  async function download(url: string) {
    const attempts: { url: string; timeout: number }[] = [
      { url, timeout: 30000 },
    ];
    if (MIRRORS[url]) attempts.push({ url: MIRRORS[url], timeout: 60000 });
    let lastError: any;
    for (const attempt of attempts)
      for (let round = 1; round <= 2; round++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), attempt.timeout);
        try {
          const response = await session
            .fromPartition("siyuan-browser-filter-fetch")
            .fetch(attempt.url, {
              credentials: "omit",
              signal: controller.signal,
            });
          if (!response.ok) throw Error("Filter HTTP " + response.status);
          const text = await response.text();
          if (text.length > 20000000 || !text.includes("[Adblock"))
            throw Error("Invalid filter list");
          return text;
        } catch (error: any) {
          lastError = controller.signal.aborted
            ? Error("timeout " + attempt.timeout / 1000 + "s")
            : error;
          const message = String(lastError?.message ?? lastError);
          // A refused or invalid list will not improve by asking again.
          if (/^Filter HTTP 4|Invalid filter list/.test(message)) break;
          // Timeouts move on to the next candidate instead of stalling twice.
          if (round < 2 && !controller.signal.aborted)
            await new Promise((done) => setTimeout(done, 1000 * round));
        } finally {
          clearTimeout(timer);
        }
      }
    throw lastError;
  }
  let running: Promise<boolean> | null = null;
  let complete = true;
  /** Returns whether every subscribed list is now up to date. */
  async function update() {
    const urls: string[] = settings.subscriptions;
    const interval = settings.updateDays * 86400000;
    const lists: ListCache = {};
    const failures: string[] = [];
    const kept: string[] = [];
    try {
      let old: any;
      try {
        old = JSON.parse(await fs.readFile(cache, "utf8"));
      } catch {}
      if (old?.lists && typeof old.lists === "object")
        Object.assign(lists, old.lists);
      const cached = typeof old?.text === "string" ? old.text : "";
      const sameSet = JSON.stringify(old?.urls) === JSON.stringify(urls);
      const age = Date.now() - (Number(old?.time) || 0);
      if (cached) applyText(cached);
      if (!force && cached && sameSet && (!settings.updateDays || age < interval))
        return true;
      if (!settings.updateDays && !force) return !!cached;
      await Promise.all(
        urls.map(async (url) => {
          try {
            lists[url] = { text: await download(url), time: Date.now() };
          } catch (error: any) {
            const message = String(error?.message ?? error);
            // Fall back to the last good copy of this single list.
            if (lists[url]?.text) kept.push(url + " (" + message + ")");
            else failures.push(url + " (" + message + ")");
          }
        }),
      );
      for (const url of Object.keys(lists))
        if (!urls.includes(url)) delete lists[url];
      const usable = urls
        .map((url) => lists[url]?.text)
        .filter((text): text is string => !!text);
      if (!usable.length && failures.length)
        throw Error(failures.join("; "));
      const text = usable.join("\n");
      applyText(text);
      await atomicJSON(cache, { urls, text, time: Date.now(), lists });
      // Automatic retries stay quiet; a manual refresh reports what fell back.
      const notes = failures.concat(kept).join("; ");
      for (const s of states.values()) s.filterError = force ? notes : "";
      return !failures.length && !kept.length;
    } catch (e) {
      const message = String(e);
      for (const s of states.values())
        s.filterError =
          message.length > 300 ? message.slice(0, 300) + "…" : message;
      return false;
    }
  }
  function refresh() {
    running ??= update().finally(() => (running = null));
    return running;
  }
  /** Failed or partial updates retry within six hours instead of the full
   * interval, so one slow download does not freeze the rules for days. */
  const schedule = (s: any, interval: number) => {
    clearTimeout(s.timer);
    s.timer = setTimeout(
      async () => {
        complete = await refresh();
        if (states.get(partition) === s) schedule(s, interval);
      },
      Math.max(60000, complete ? interval : Math.min(interval, 6 * 3600000)),
    );
  };
  complete = await refresh();
  const s = states.get(partition);
  if (!s) return;
  if (settings.updateDays) schedule(s, settings.updateDays * 86400000);
  return { loaded: !!s.engine, error: s.filterError || "" };
}
function owned(partition: string, id: number) {
  const s = states.get(partition),
    w = webContents.fromId(id);
  if (!s || !w || !s.guests.has(id)) throw Error("Unknown browser instance");
  return w;
}
export async function snapshot(
  partition: string,
  id: number,
  expectedURL: string,
) {
  const w = owned(partition, id);
  if (w.getURL() !== expectedURL) throw Error("Page changed during save");
  const dir = await fs.mkdtemp(
    path.join(app.getPath("temp"), "siyuan-browser-"),
  );
  try {
    const f = path.join(dir, "page.mhtml");
    await w.savePage(f, "MHTML");
    if (w.getURL() !== expectedURL) throw Error("Page changed during save");
    if ((await fs.stat(f)).size > 256 * 1024 * 1024)
      throw Error("Snapshot exceeds 256 MiB");
    return (await fs.readFile(f)).toString("base64");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
export async function resource(
  partition: string,
  url: string,
  maxBytes = 32 * 1024 * 1024,
) {
  if (!httpURL(url)) throw Error("Only HTTP(S) resources");
  const s = states.get(partition);
  if (!s) throw Error("Session closed");
  const parsed = new URL(url);
  if (parsed.port === s.kernelPort || parsed.port === "6806")
    throw Error("Kernel resources are forbidden");
  const limit = Math.max(
    1,
    Math.min(
      32 * 1024 * 1024,
      Number.isSafeInteger(maxBytes) ? maxBytes : 32 * 1024 * 1024,
    ),
  );
  const r = await s.ses.fetch(url, {
    signal: AbortSignal.any([s.abort.signal, AbortSignal.timeout(30000)]),
  });
  if (!r.ok) throw Error("HTTP " + r.status);
  if (Number(r.headers.get("content-length")) > limit) {
    await r.body?.cancel();
    throw Error("Resource exceeds " + limit + " bytes");
  }
  const parts: Uint8Array[] = [];
  let size = 0;
  const reader = r.body!.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error("Resource exceeds " + limit + " bytes");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return {
    base64: Buffer.concat(parts).toString("base64"),
    mime: r.headers.get("content-type") || "application/octet-stream",
  };
}
export async function copyImage(partition: string, url: string) {
  const r = await resource(partition, url);
  const image = nativeImage.createFromBuffer(Buffer.from(r.base64, "base64"));
  if (image.isEmpty()) throw Error("Unsupported image");
  clipboard.writeImage(image);
}
export function setPageFiltering(
  partition: string,
  id: number,
  enabled: boolean,
) {
  owned(partition, id);
  const s = states.get(partition);
  s.filterOverrides.set(id, !!enabled);
}
export function action(
  partition: string,
  id: number,
  name: string,
  ...args: any[]
) {
  const w = owned(partition, id);
  if (
    ![
      "copy",
      "cut",
      "paste",
      "delete",
      "selectAll",
      "setAudioMuted",
      "isAudioMuted",
      "setZoomFactor",
    ].includes(name)
  )
    throw Error("Unsupported action");
  return (w as any)[name](...args);
}
export async function clear(partition: string, kind: string) {
  const s = states.get(partition);
  if (!s) throw Error("Session closed");
  if (kind === "cache" || kind === "all") await s.ses.clearCache();
  if (kind === "cookies")
    await s.ses.clearStorageData({ storages: ["cookies"] });
  if (kind === "all") {
    await s.ses.clearStorageData();
    await s.ses.clearAuthCache();
  }
}
export function status(partition: string) {
  const s = states.get(partition);
  return {
    partition,
    guests: s ? [...s.guests] : [],
    filterLoaded: !!s?.engine,
    filterError: s?.filterError || "",
  };
}
export async function archive(partition: string, base64: string) {
  const s = states.get(partition);
  if (!s) throw Error("Session closed");
  const dir = await fs.mkdtemp(
    path.join(app.getPath("temp"), "siyuan-browser-archive-"),
  );
  const f = path.join(dir, "page.mhtml");
  await fs.writeFile(f, Buffer.from(base64, "base64"));
  const archivePartition = "siyuan-browser-archive-" + randomUUID();
  const ses = session.fromPartition(archivePartition);
  const url = pathToFileURL(f).href;
  ses.setPermissionRequestHandler((_w: any, _p: any, cb: any) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (d: any, cb: any) =>
    cb({ cancel: d.url !== url }),
  );
  const hook = (_e: any, w: any) => {
    if (w.session !== ses) return;
    w.setWindowOpenHandler(() => ({ action: "deny" }));
    w.on("will-navigate", (e: any, target: string) => {
      if (target !== url) e.preventDefault();
    });
    w.on("will-attach-webview", (e: any) => e.preventDefault());
  };
  app.on("web-contents-created", hook);
  const record = { partition: archivePartition, url, dir, ses, hook };
  s.archives.add(record);
  return { partition: archivePartition, url };
}
export async function release(partition: string, owner: number) {
  const s = states.get(partition);
  if (!s) return;
  const ownerHost = webContents.fromId(owner);
  const listener = s.ownerDestroyed?.get(owner);
  if (ownerHost && listener) ownerHost.removeListener("destroyed", listener);
  s.ownerDestroyed?.delete(owner);
  s.owners.delete(owner);
  for (const id of s.guests) {
    const w = webContents.fromId(id);
    if (w?.hostWebContents?.id === owner)
      w.close({ waitForBeforeUnload: false });
  }
  if (s.owners.size) return;
  states.delete(partition);
  clearInterval(s.timer);
  s.abort.abort();
  app.removeListener("web-contents-created", s.created);
  s.ses.removeListener("will-download", s.download);
  s.ses.webRequest.onBeforeRequest(null);
  s.ses.setPermissionRequestHandler(null);
  s.ses.setPermissionCheckHandler(null);
  for (const a of s.archives) {
    app.removeListener("web-contents-created", a.hook);
    for (const w of webContents.getAllWebContents())
      if (w.session === a.ses) w.close({ waitForBeforeUnload: false });
    a.ses.webRequest.onBeforeRequest(null);
    await fs.rm(a.dir, { recursive: true, force: true });
  }
}

/** Only known suggestion providers can receive address-bar queries. */
export async function searchSuggestions(
  partition: string,
  engine: string,
  query: string,
): Promise<string[]> {
  if (
    !query.trim() ||
    query.length > 200 ||
    /^(?:https?:\/\/|siyuan-browser:)/i.test(query)
  )
    return [];
  const q = encodeURIComponent(query);
  const providers: Record<string, string> = {
    Google: `https://suggestqueries.google.com/complete/search?client=firefox&q=${q}`,
    Bing: `https://api.bing.com/osjson.aspx?query=${q}`,
    DuckDuckGo: `https://duckduckgo.com/ac/?q=${q}&type=list`,
  };
  if (!providers[engine]) return [];
  const result = await resource(partition, providers[engine]);
  if (result.base64.length > 128 * 1024) return [];
  const data = JSON.parse(
    Buffer.from(result.base64, "base64").toString("utf8"),
  );
  return Array.isArray(data?.[1])
    ? data[1]
        .filter(
          (term: unknown) => typeof term === "string" && term.length <= 200,
        )
        .slice(0, 6)
    : [];
}
