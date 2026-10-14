export const ENGINES: Record<string, string> = {
  DuckDuckGo: "https://duckduckgo.com/?q=%s",
  Brave: "https://search.brave.com/search?q=%s",
  Bing: "https://www.bing.com/search?q=%s",
  Google: "https://www.google.com/search?q=%s",
};
export const HOME_URL = "siyuan-browser://home";
// A blank guest keeps the built-in page in Electron's back/forward history.
// The actual home UI and workspace data stay in the SiYuan renderer.
export const HOME_GUEST_URL = "about:blank#siyuan-browser-home";
export const INTERNAL_URLS = {
  home: HOME_URL,
  bookmarks: "siyuan-browser://bookmarks",
  history: "siyuan-browser://history",
} as const;
export type InternalPage = keyof typeof INTERNAL_URLS;
export type LibraryKind = Exclude<InternalPage, "home">;
const INTERNAL_GUEST_URLS: Record<InternalPage, string> = {
  home: HOME_GUEST_URL,
  bookmarks: "about:blank#siyuan-browser-bookmarks",
  history: "about:blank#siyuan-browser-history",
};
export function internalPage(url: string): InternalPage | undefined {
  return (Object.keys(INTERNAL_URLS) as InternalPage[]).find(
    (page) => INTERNAL_URLS[page] === url,
  );
}
export function internalGuestURL(url: string): string | undefined {
  const page = internalPage(url);
  return page ? INTERNAL_GUEST_URLS[page] : undefined;
}
export function internalPageFromGuest(url: string): InternalPage | undefined {
  return (Object.keys(INTERNAL_GUEST_URLS) as InternalPage[]).find(
    (page) => INTERNAL_GUEST_URLS[page] === url,
  );
}
export const HOME_SECTIONS = [
  "bookmarks",
  "mostVisited",
  "recentlyClosed",
  "history",
] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];
export interface HomeLayout {
  order: HomeSection[];
  hidden: HomeSection[];
}
export interface Entry {
  url: string;
  title: string;
  time: number;
  visits?: number;
  favicon?: string;
}
export interface ClosedEntry extends Entry {
  id: string;
}
export interface Config {
  version: 2;
  takeover: boolean;
  home: string;
  engine: string;
  customSearch: string;
  adblock: boolean;
  subscriptions: string[];
  updateDays: number;
  notebook: string;
  parentPath: string;
  savePathMode: "search" | "template";
  pathTemplate: string;
  databaseID: string;
  databaseName: string;
  databaseBlockID: string;
  databaseViewID: string;
  databaseTemplateID: string;
  tags: string;
  history: Entry[];
  bookmarks: Entry[];
  recentlyClosed: ClosedEntry[];
  homeLayout: HomeLayout;
}
export const defaults: Config = {
  version: 2,
  takeover: true,
  home: HOME_URL,
  engine: "DuckDuckGo",
  customSearch: "https://duckduckgo.com/?q=%s",
  adblock: true,
  subscriptions: [
    "https://easylist.to/easylist/easylist.txt",
    "https://easylist.to/easylist/easyprivacy.txt",
  ],
  updateDays: 4,
  notebook: "",
  parentPath: "/",
  savePathMode: "template",
  pathTemplate: "/网页剪藏",
  databaseID: "",
  databaseName: "",
  databaseBlockID: "",
  databaseViewID: "",
  databaseTemplateID: "",
  tags: "",
  history: [],
  bookmarks: [],
  recentlyClosed: [],
  homeLayout: { order: [...HOME_SECTIONS], hidden: [] },
};
export function httpURL(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
export function address(value: string, template = ENGINES.DuckDuckGo): string {
  const q = value.trim();
  if (!q) return "about:blank";
  if (q === "siyuan-browser://") return HOME_URL;
  const page = internalPage(q.replace(/\/$/, ""));
  if (page) return INTERNAL_URLS[page];
  if (q === "about:blank" || httpURL(q)) return q;
  if (/^[a-z][a-z\d+.-]*:/i.test(q) && !/^localhost:\d+/i.test(q))
    throw Error("Unsupported URL protocol");
  if (
    !/\s/.test(q) &&
    /^(localhost(?::\d+)?|(?:[\p{L}\d-]+\.)+[\p{L}\d-]+)(?::\d+)?(?:[/?#].*)?$/u.test(
      q,
    )
  )
    return "https://" + q;
  if (!template.includes("%s") || !httpURL(template.replace("%s", "query")))
    throw Error("Search template must be HTTP(S) and contain %s");
  return template.replaceAll("%s", encodeURIComponent(q));
}
export function clampZoom(value: number): number {
  return Math.max(0.5, Math.min(3, Math.round(value * 10) / 10));
}
export function addHistory(list: Entry[], e: Entry): Entry[] {
  if (!httpURL(e.url)) return list;
  return [e, ...list.filter((x) => x.url !== e.url)].slice(0, 1000);
}
export function recordVisit(list: Entry[], e: Entry): Entry[] {
  const previous = list.find((item) => item.url === e.url);
  return addHistory(list, {
    ...(previous?.favicon ? { favicon: previous.favicon } : {}),
    ...e,
    visits: (previous?.visits || (previous ? 1 : 0)) + 1,
  });
}
export function updateHistoryTitle(
  list: Entry[],
  url: string,
  title: string,
): Entry[] {
  return list.map((entry) => (entry.url === url ? { ...entry, title } : entry));
}
export function mostVisited(list: Entry[]): Entry[] {
  return [...list].sort(
    (a, b) => (b.visits || 1) - (a.visits || 1) || b.time - a.time,
  );
}
export function addClosed(list: ClosedEntry[], e: ClosedEntry): ClosedEntry[] {
  return httpURL(e.url) ? [e, ...list].slice(0, 50) : list;
}
export function readHomeLayout(raw: unknown): HomeLayout {
  const x = raw && typeof raw === "object" ? (raw as Partial<HomeLayout>) : {};
  const valid = (value: unknown): value is HomeSection =>
    HOME_SECTIONS.includes(value as HomeSection);
  const order = Array.isArray(x.order) ? x.order.filter(valid) : [];
  return {
    order: [...new Set([...order, ...HOME_SECTIONS])],
    hidden: Array.isArray(x.hidden) ? [...new Set(x.hidden.filter(valid))] : [],
  };
}
export function moveHomeSection(
  layout: HomeLayout,
  section: HomeSection,
  target: HomeSection,
): HomeLayout {
  const order = [...layout.order];
  const from = order.indexOf(section),
    to = order.indexOf(target);
  if (from < 0 || to < 0) return layout;
  order.splice(from, 1);
  order.splice(to, 0, section);
  return { ...layout, order };
}
export function suggestions(c: Config, q: string): Entry[] {
  const seen = new Set<string>();
  return [...c.bookmarks, ...c.history]
    .filter((x) => {
      if (seen.has(x.url)) return false;
      seen.add(x.url);
      return (x.title + " " + x.url)
        .toLocaleLowerCase()
        .includes(q.toLocaleLowerCase());
    })
    .slice(0, 12);
}
export function safeTitle(value: string): string {
  return (
    value
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
      .trim()
      .slice(0, 120) || "Web page"
  );
}
export function readConfig(raw: unknown): Config {
  const c: Config = {
    ...defaults,
    history: [],
    bookmarks: [],
    recentlyClosed: [],
    homeLayout: readHomeLayout(undefined),
  };
  if (!raw || typeof raw !== "object") return c;
  const x = raw as Partial<Config>;
  for (const k of ["takeover", "adblock"] as const)
    if (typeof x[k] === "boolean") c[k] = x[k]!;
  for (const k of [
    "engine",
    "customSearch",
    "notebook",
    "parentPath",
    "pathTemplate",
    "databaseID",
    "databaseName",
    "databaseBlockID",
    "databaseViewID",
    "databaseTemplateID",
    "tags",
  ] as const)
    if (typeof x[k] === "string") c[k] = x[k]!;
  if (x.savePathMode === "search" || x.savePathMode === "template")
    c.savePathMode = x.savePathMode;
  else if (x.notebook) c.savePathMode = "search";
  if (typeof x.home === "string") {
    try {
      c.home = address(x.home);
      // Replace the old default while retaining custom website homepages.
      if (x.version !== 2 && c.home === "about:blank") c.home = HOME_URL;
    } catch {
      /* Invalid persisted home values use the built-in page. */
    }
  }
  c.homeLayout = readHomeLayout(x.homeLayout);
  if (typeof x.updateDays === "number")
    c.updateDays = Math.max(0, Math.min(24, x.updateDays));
  if (Array.isArray(x.subscriptions))
    c.subscriptions = x.subscriptions.filter(httpURL);
  for (const k of ["history", "bookmarks"] as const)
    if (Array.isArray(x[k]))
      c[k] = x[k]!.filter(
        (e) => e && httpURL(e.url) && typeof e.title === "string",
      )
        .slice(0, 1000)
        .map((e) => ({
          url: e.url,
          title: e.title,
          ...(typeof e.favicon === "string" &&
          httpURL(e.favicon) &&
          e.favicon.length <= 4096
            ? { favicon: e.favicon }
            : {}),
          time: Number.isFinite(e.time) && e.time >= 0 ? e.time : 0,
          ...(k === "history"
            ? {
                visits:
                  Number.isSafeInteger(e.visits) && e.visits! > 0
                    ? e.visits
                    : 1,
              }
            : {}),
        }));
  if (Array.isArray(x.recentlyClosed))
    c.recentlyClosed = x.recentlyClosed
      .filter(
        (e) =>
          e &&
          httpURL(e.url) &&
          typeof e.title === "string" &&
          typeof e.id === "string",
      )
      .slice(0, 50)
      .map((e) => ({
        id: e.id,
        url: e.url,
        title: e.title,
        ...(typeof e.favicon === "string" &&
        httpURL(e.favicon) &&
        e.favicon.length <= 4096
          ? { favicon: e.favicon }
          : {}),
        time: Number.isFinite(e.time) && e.time >= 0 ? e.time : 0,
      }));
  return c;
}
