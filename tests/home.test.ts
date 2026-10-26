import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import {
  HOME_URL,
  HOME_GUEST_URL,
  HOME_SECTIONS,
  INTERNAL_URLS,
  internalGuestURL,
  internalPageFromGuest,
  address,
  readConfig,
  recordVisit,
  updateHistoryTitle,
  mostVisited,
  addClosed,
} from "../src/core";

test("internal addresses normalize only known pages and map to isolated blank guests", () => {
  assert.equal(address("siyuan-browser://"), HOME_URL);
  for (const [page, url] of Object.entries(INTERNAL_URLS)) {
    assert.equal(address(url + "/"), url);
    assert.equal(internalPageFromGuest(internalGuestURL(url)!), page);
    assert.equal(recordVisit([], { url, title: page, time: 1 }).length, 0);
    assert.equal(
      addClosed([], { id: page, url, title: page, time: 1 }).length,
      0,
    );
  }
  assert.throws(() => address("siyuan-browser://unknown"));
  assert.throws(() => address("siyuan-browser://history?script=1"));
  assert.equal(
    internalPageFromGuest("about:blank#siyuan-browser-unknown"),
    undefined,
  );
});

test("home configuration migrates the old blank default, preserves custom homes and validates layout/data", () => {
  assert.equal(address(HOME_URL), HOME_URL);
  assert.throws(() => address("siyuan-browser://other"));
  assert.equal(readConfig({ version: 1, home: "about:blank" }).home, HOME_URL);
  assert.equal(
    readConfig({ version: 2, home: "about:blank" }).home,
    "about:blank",
  );
  assert.equal(
    readConfig({ home: "https://example.com/" }).home,
    "https://example.com/",
  );
  const config = readConfig({
    home: "javascript:alert(1)",
    homeLayout: {
      order: ["history", "history", "unknown"],
      hidden: ["bookmarks", "unknown"],
    },
    history: [
      { url: "https://example.com", title: "Old", time: NaN, visits: -2 },
    ],
    recentlyClosed: [
      { url: "file:///etc/passwd", title: "Bad", id: "bad", time: 0 },
    ],
  });
  assert.equal(config.home, HOME_URL);
  assert.deepEqual(config.homeLayout.order, [
    "history",
    "bookmarks",
    "mostVisited",
    "recentlyClosed",
  ]);
  assert.deepEqual(config.homeLayout.hidden, ["bookmarks"]);
  assert.equal(config.history[0].time, 0);
  assert.equal(config.history[0].visits, 1);
  assert.equal(config.recentlyClosed.length, 0);
  const fresh = readConfig(undefined);
  config.homeLayout.hidden.push("history");
  assert.deepEqual(fresh.homeLayout.hidden, []);
});

test("frequency counts navigation only; title updates preserve counts/time and closed tabs remain bounded", () => {
  let history = readConfig(undefined).history;
  history = recordVisit(history, {
    url: "https://a.example",
    title: "A",
    time: 1,
  });
  history = recordVisit(history, {
    url: "https://b.example",
    title: "B",
    time: 2,
  });
  history = recordVisit(history, {
    url: "https://a.example",
    title: "A",
    time: 3,
  });
  history = updateHistoryTitle(history, "https://a.example", "Updated");
  history = updateHistoryTitle(history, "https://a.example", "Updated again");
  history = recordVisit(history, { url: HOME_URL, title: "Home", time: 4 });
  assert.equal(history.length, 2);
  assert.equal(history[0].visits, 2);
  assert.equal(history[0].time, 3);
  assert.equal(mostVisited(history)[0].url, "https://a.example");
  const closed = Array.from({ length: 55 }, (_, i) => ({
    id: String(i),
    url: "https://a.example",
    title: "A",
    time: i,
  }));
  assert.equal(addClosed(closed, closed[0]).length, 50);
  assert.equal(addClosed([], { ...closed[0], url: HOME_URL }).length, 0);
});

test("homepage navigation, close/reopen and section changes integrate with browser lifecycle", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://siyuan.local",
  });
  Object.assign(globalThis, {
    document: dom.window.document,
    window: dom.window,
    DOMParser: dom.window.DOMParser,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  const bundle = await build({
    stdin: {
      contents:
        'export { default as BrowserPlugin } from "./src/index"; export { BrowserView } from "./src/view"; export { homeLayoutControls } from "./src/home";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    define: { DESKTOP_FILENAME: '"test.cjs"' },
    plugins: [
      {
        name: "siyuan-stub",
        setup(builder) {
          builder.onResolve({ filter: /^siyuan$/ }, () => ({
            path: "siyuan",
            namespace: "stub",
          }));
          builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents: `
          export class Plugin { saveData() { return Promise.resolve(); } };
          export class Menu { addItem() {} addSeparator() {} open() {} };
          export class Dialog {};
          export class Setting {};
          export function showMessage() {};
          export function saveLayout(fn) { fn(); };
          export function getAllModels() { return {outline: []}; };
          export function openTab(options) { return Promise.resolve({ options }); };
          export function openWindow() {};
          export function getFrontend() { return 'desktop'; };
        `,
          }));
          builder.onLoad({ filter: /\.css$/ }, () => ({
            contents: "",
            loader: "js",
          }));
        },
      },
    ],
  });
  const module = { exports: {} as any };
  new Function("module", "exports", "require", bundle.outputFiles[0].text)(
    module,
    module.exports,
    () => ({}),
  );
  const { BrowserPlugin, BrowserView, homeLayoutControls } = module.exports;
  const p = new BrowserPlugin();
  p.config = readConfig(undefined);
  p.t = (key: string) => key;
  let guestID = 0;
  const createGuest = () => {
    const web = document.createElement("div") as any;
    const id = ++guestID;
    const journal: string[] = [];
    let cursor = -1;
    let url = "about:blank";
    const emit = (name: string, data: Record<string, unknown> = {}) =>
      web.dispatchEvent(Object.assign(new dom.window.Event(name), data));
    const navigate = (target: string) => {
      const sameDocument = url.split("#")[0] === target.split("#")[0];
      url = target;
      emit("dom-ready");
      emit(sameDocument ? "did-navigate-in-page" : "did-navigate", { url });
      if (!sameDocument) emit("did-stop-loading");
    };
    Object.defineProperty(web, "src", {
      set(target: string) {
        journal.splice(cursor + 1);
        journal.push(target);
        cursor++;
        navigate(target);
      },
    });
    Object.assign(web, {
      getWebContentsId: () => id,
      getURL: () => url,
      setZoomFactor(value: number) {
        web.zoomFactor = value;
      },
      getZoomFactor() {
        return web.zoomFactor;
      },
      setAudioMuted() {},
      stopFindInPage() {
        if (cursor < 0) throw Error("Guest is not ready");
      },
      executeJavaScript: () => Promise.resolve(),
      canGoBack: () => cursor > 0,
      canGoForward: () => cursor < journal.length - 1,
      goBack: () => {
        if (cursor > 0) navigate(journal[--cursor]);
      },
      goForward: () => {
        if (cursor < journal.length - 1) navigate(journal[++cursor]);
      },
      emitTitle: (title: string) => emit("page-title-updated", { title }),
      emitEvent: emit,
      stop() {
        web.stopped = true;
      },
    });
    return web;
  };
  let hostZoom = 1.25;
  p.adapter = {
    create: createGuest,
    bridge: {},
    partition: "test",
    hostZoom: () => hostZoom,
  };
  const mount = (url = HOME_URL) => {
    const root = document.createElement("div");
    document.body.append(root);
    const v = new BrowserView(
      p,
      {
        element: root,
        data: {},
        tab: { headElement: document.createElement("div"), updateTitle() {} },
      },
      { url },
    );
    p.views.add(v);
    return v;
  };
  const v = mount();
  try {
    const dock = document.createElement("div");
    p.libraryRoots.add(dock);
    p.renderLibrary(dock);
    assert.equal(dock.querySelectorAll(".sb-dock-row").length, 1);
    let switched = false;
    v.custom.tab.parent = {
      switchTab() {
        switched = true;
      },
    };
    dock.querySelector<HTMLButtonElement>(".sb-dock-row")!.click();
    assert.equal(switched, true);
    const search = dock.querySelector<HTMLInputElement>("input")!;
    search.value = "no-such-tab";
    search.dispatchEvent(new dom.window.Event("input"));
    assert.equal(dock.querySelectorAll(".sb-dock-row").length, 0);
    p.refreshDocks();
    assert.equal(dock.querySelector("input"), search);
    assert.equal(search.value, "no-such-tab");
    search.value = "";
    search.dispatchEvent(new dom.window.Event("input"));
    assert.equal(dock.querySelectorAll(".sb-dock-row").length, 1);
    assert.equal(v.web.getURL(), HOME_GUEST_URL);
    assert.equal(v.homePage.root.hidden, false);
    assert.equal(v.bookmarkButton.disabled, true);
    assert.equal(v.bar.value, "");
    assert.deepEqual(
      [...v.homePage.sections.children].map(
        (node: any) => node.dataset.section,
      ),
      HOME_SECTIONS,
    );
    assert.equal(p.config.recentlyClosed.length, 0);
    v.navigate("https://example.com/");
    v.web.emitTitle("Example");
    v.web.emitTitle("Example updated");
    assert.equal(p.config.history[0].visits, 1);
    assert.equal(p.config.history[0].title, "Example updated");
    assert.equal(v.homePage.root.hidden, true);
    assert.equal(v.web.hidden, false);
    // The star reflects the saved state of the current URL and toggles it.
    assert.equal(v.bookmarkButton.getAttribute("aria-pressed"), "false");
    assert.equal(v.bookmarkButton.title, "bookmark");
    v.bookmarkButton.click();
    assert.equal(v.bookmarkButton.getAttribute("aria-pressed"), "true");
    assert.equal(v.bookmarkButton.title, "removeBookmark");
    assert.ok(
      p.config.bookmarks.some((entry: any) => entry.url === "https://example.com/"),
    );
    assert.equal(
      p.config.bookmarks[0].title,
      "Example updated",
      "the bookmark name follows the page title",
    );
    v.bookmarkButton.click();
    assert.equal(v.bookmarkButton.getAttribute("aria-pressed"), "false");
    assert.equal(p.config.bookmarks.length, 0);
    // Save it again so the navigation below has a filled star to restore.
    v.bookmarkButton.click();
    // syncPage keeps the guest journal untouched, so the history counts asserted
    // later in this test stay valid.
    v.syncPage("https://other.example/");
    assert.equal(
      v.bookmarkButton.getAttribute("aria-pressed"),
      "false",
      "a different page must not inherit the previous filled star",
    );
    v.syncPage("https://example.com/");
    assert.equal(
      v.bookmarkButton.getAttribute("aria-pressed"),
      "true",
      "returning to a saved page fills the star again",
    );
    p.removeEntry("bookmarks", "https://example.com/");
    assert.equal(
      v.bookmarkButton.getAttribute("aria-pressed"),
      "false",
      "deleting the bookmark elsewhere empties the star",
    );
    // A page that has not reported a title yet falls back to the host name.
    const savedTitle = v.title;
    v.title = "https://plain.example/";
    assert.equal(v.bookmarkTitle("https://plain.example/"), "plain.example");
    v.title = savedTitle;
    Object.defineProperty(v.web, "clientWidth", { value: 800 });
    // macOS pointer activation can blur the panel without focusing a button.
    // The blur microtask runs before mouseup/click, so hiding here swallows it.
    v.showPageMenu();
    const zoomIn = v.pageMenu.querySelector(
      '[title="zoomIn"]',
    ) as HTMLButtonElement;
    zoomIn.dispatchEvent(
      new dom.window.MouseEvent("mousedown", { bubbles: true }),
    );
    v.pageMenu.blur();
    await Promise.resolve();
    assert.equal(
      v.pageMenu.hidden,
      false,
      "null-relatedTarget blur must not swallow a pointer click",
    );
    zoomIn.dispatchEvent(
      new dom.window.MouseEvent("mouseup", { bubbles: true }),
    );
    zoomIn.click();
    await Promise.resolve();
    assert.equal(v.zoom, 1.1);
    assert.equal(v.pageMenu.hidden, false);
    v.bar.focus();
    await Promise.resolve();
    assert.equal(
      v.pageMenu.hidden,
      true,
      "keyboard focus leaving the menu dismisses it",
    );
    v.showPageMenu();
    v.pageMenu.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert.equal(v.pageMenu.hidden, true);
    v.setZoom(1.2);
    assert.equal(v.web.getZoomFactor(), 1.5);
    hostZoom = 1.5;
    window.dispatchEvent(new dom.window.Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(Math.abs(v.web.getZoomFactor() - 1.8) < 1e-10);
    assert.equal(v.zoom, 1.2);
    Object.assign(globalThis, { KeyboardEvent: dom.window.KeyboardEvent });
    v.bar.focus();
    const forwarded: string[] = [];
    v.bar.addEventListener("keydown", (e: KeyboardEvent) =>
      forwarded.push(e.key),
    );
    for (const key of ["+", "=", "-", "0"]) {
      p.event({
        type: "key",
        id: v.web.getWebContentsId(),
        input: { key, meta: true },
      });
    }
    assert.deepEqual(forwarded, ["+", "=", "-", "0"]);
    assert.equal(v.zoom, 1.2);
    v.setZoom(1);
    assert.equal(v.web.getZoomFactor(), hostZoom);
    v.back.click();
    assert.equal(v.url, HOME_URL);
    assert.equal(v.homePage.root.hidden, false);
    v.forward.click();
    assert.equal(v.url, "https://example.com/");
    assert.equal(p.config.history[0].visits, 2);
    v.web.emitTitle("Reader article");
    v.navigate("https://example.com/#reader");
    assert.equal(p.config.history[0].url, "https://example.com/#reader");
    assert.equal(p.config.history[0].visits, 1);
    assert.equal(p.config.history[0].title, "Reader article");
    assert.equal(v.back.disabled, false);
    v.back.click();
    assert.equal(v.forward.disabled, false);
    assert.equal(p.config.history[0].visits, 3);
    v.navigate(HOME_URL);
    assert.equal(p.config.history.length, 2);
    const controls = homeLayoutControls(p);
    const staleControls = homeLayoutControls(p);
    const hide = controls.querySelector(
      '[data-control="bookmarks-toggle"]',
    ) as HTMLInputElement;
    hide.checked = false;
    hide.dispatchEvent(new dom.window.Event("change"));
    assert.equal(
      v.homePage.sections.querySelector('[data-section="bookmarks"]'),
      null,
    );
    (
      controls.querySelector(
        '[data-control="history-moveUp"]',
      ) as HTMLButtonElement
    ).click();
    assert.deepEqual(p.config.homeLayout.order, [
      "bookmarks",
      "mostVisited",
      "history",
      "recentlyClosed",
    ]);
    const drag = controls.querySelector(
      '[data-section="history"] .sb-home-drag',
    )!;
    drag.dispatchEvent(new dom.window.Event("dragstart"));
    controls
      .querySelector('[data-section="bookmarks"]')!
      .dispatchEvent(new dom.window.Event("drop", { cancelable: true }));
    assert.equal(p.config.homeLayout.order[0], "history");
    const hideHistory = staleControls.querySelector(
      '[data-control="history-toggle"]',
    ) as HTMLInputElement;
    hideHistory.checked = false;
    hideHistory.dispatchEvent(new dom.window.Event("change"));
    assert.deepEqual(p.config.homeLayout.hidden, ["bookmarks", "history"]);
    assert.equal(p.config.homeLayout.order[0], "history");
    const restored = readConfig(JSON.parse(JSON.stringify(p.config)));
    assert.deepEqual(restored.homeLayout, p.config.homeLayout);
    p.bookmark("https://safe.example", '<img src=x onerror="alert(1)">');
    p.config.homeLayout.hidden = [];
    p.refreshPages();
    assert.equal(v.homePage.sections.querySelector("img"), null);
    p.addBookmark("added.example", "Added");
    assert.throws(() => p.addBookmark("search query", "Bad"));
    assert.throws(() => p.addBookmark("javascript:alert(1)", "Bad"));
    const closed = mount("https://closed.example/");
    closed.web.emitTitle("Closed page");
    closed.destroy();
    closed.destroy();
    assert.equal(p.config.recentlyClosed.length, 1);
    assert.ok(
      v.homePage.sections.querySelector('[data-section="recentlyClosed"] a'),
    );
    const entry = p.config.recentlyClosed[0];
    await p.reopen(entry);
    assert.equal(p.config.recentlyClosed.length, 0);
    const loader = mount("https://loading.example/");
    const head = loader.custom.tab.headElement as HTMLElement;
    loader.web.emitEvent("did-start-loading");
    assert.equal(loader.loading, true);
    assert.ok(head.querySelector(".sb-tab-spinner"));
    assert.equal(loader.status.textContent, "");
    let completeIcon!: (value: unknown) => void;
    let iconTask!: Promise<void>;
    const guard = p.guard.bind(p);
    p.guard = (fn: () => Promise<any>) => (iconTask = guard(fn));
    p.adapter.bridge.resource = () =>
      new Promise((resolve) => {
        completeIcon = resolve;
      });
    loader.web.emitEvent("page-favicon-updated", {
      favicons: ["https://loading.example/favicon.png"],
    });
    completeIcon({ mime: "image/png", base64: "first" });
    await iconTask;
    assert.ok(head.querySelector(".sb-tab-spinner"));
    loader.web.emitEvent("did-stop-loading");
    assert.equal(head.querySelector(".sb-tab-spinner"), null);
    assert.equal(head.querySelector("img")?.src, "data:image/png;base64,first");
    assert.equal(
      p.config.history.find((entry: any) => entry.url === loader.url).favicon,
      "https://loading.example/favicon.png",
    );
    const visits = p.config.history.find(
      (entry: any) => entry.url === loader.url,
    ).visits;
    p.bookmark(loader.url, "Loader");
    assert.equal(
      p.config.bookmarks[0].favicon,
      "https://loading.example/favicon.png",
    );
    p.closed(loader.url, "Loader");
    assert.equal(
      p.config.recentlyClosed[0].favicon,
      "https://loading.example/favicon.png",
    );
    p.removeClosed(p.config.recentlyClosed[0].id);
    assert.equal(
      p.config.history.find((entry: any) => entry.url === loader.url).visits,
      visits,
    );
    loader.web.emitEvent("did-start-loading");
    loader.web.emitEvent("did-fail-load", {
      isMainFrame: false,
      errorCode: -105,
      errorDescription: "Subframe error",
    });
    assert.equal(loader.loading, true);
    loader.web.emitEvent("did-fail-load", {
      isMainFrame: true,
      errorCode: -105,
      errorDescription: "DNS error",
    });
    assert.equal(loader.loading, false);
    assert.equal(head.querySelector(".sb-tab-spinner"), null);
    assert.equal(loader.errorPage.hidden, false);
    assert.equal(loader.web.hidden, true);
    assert.match(loader.errorPage.textContent, /error_dns/);
    assert.match(loader.errorPage.textContent, /DNS error/);
    loader.web.emitEvent("did-start-loading");
    assert.equal(loader.status.textContent, "");
    assert.equal(loader.errorPage.hidden, true);
    loader.reload.click();
    assert.equal(loader.web.stopped, true);
    assert.equal(loader.loading, false);
    assert.equal(head.querySelector(".sb-tab-spinner"), null);
    loader.web.emitEvent("did-start-loading");
    loader.web.emitEvent("page-favicon-updated", {
      favicons: ["https://loading.example/late.png"],
    });
    loader.navigate(HOME_URL);
    completeIcon({ mime: "image/png", base64: "stale" });
    await iconTask;
    assert.equal(head.querySelector("img"), null);
    assert.equal(head.querySelector(".sb-tab-spinner"), null);
    loader.destroy();
    loader.web.emitEvent("did-start-loading");
    assert.equal(head.querySelector(".sb-tab-spinner"), null);
    p.guard = guard;
    const outlining = mount("https://outline.example/");
    let finishSource!: (value: unknown) => void;
    outlining.web.executeJavaScript = () =>
      new Promise((resolve) => {
        finishSource = resolve;
      });
    const pendingOutline = outlining.refreshOutline();
    assert.equal(outlining.outlineLoading, true);
    outlining.navigate(HOME_URL);
    finishSource({
      url: "https://outline.example/",
      title: "Old page",
      html: "<h2>Old heading</h2>",
      headings: [],
    });
    assert.equal(await pendingOutline, undefined);
    assert.deepEqual(outlining.outline, []);
    assert.equal(outlining.outlineLoading, false);
    outlining.destroy();
    const modalView = mount("https://modal.example/article");
    const prose =
      "This article explains how dynamic content should behave. ".repeat(80);
    const baseline = {
      url: modalView.url,
      title: "Dynamic article",
      transient: false,
      html: `<title>Dynamic article</title><article><h1>Dynamic article</h1><p>${prose}</p><h2 id="first" data-sb-outline-target="first">First section</h2><p>${prose}</p><h2 id="second" data-sb-outline-target="second">Second section</h2><p>${prose}</p></article>`,
      headings: [
        { key: "title", id: "", text: "Dynamic article", level: 1 },
        { key: "first", id: "first", text: "First section", level: 2 },
        { key: "second", id: "second", text: "Second section", level: 2 },
      ],
    };
    modalView.web.executeJavaScript = async () => baseline;
    const stableArticle = await modalView.refreshOutline();
    const stableOutline = modalView.outline;
    assert.equal(stableOutline.length, 3);
    modalView.outlineCurrent = stableOutline[1].key;
    // Electron emits guest loading for a login iframe, without a main document load.
    modalView.web.emitEvent("did-start-navigation", {
      isMainFrame: false,
      isInPlace: false,
    });
    modalView.web.emitEvent("did-start-loading");
    assert.equal(modalView.outline, stableOutline);
    modalView.web.executeJavaScript = async () => ({
      ...baseline,
      transient: true,
      html: "<h2>Sign in</h2>",
      headings: [],
    });
    assert.equal(await modalView.refreshOutline(), stableArticle);
    assert.equal(modalView.outline, stableOutline);
    assert.equal(modalView.outlineCurrent, stableOutline[1].key);
    assert.equal(modalView.outlineLoading, false);
    modalView.web.executeJavaScript = async () => {
      throw Error("Guest temporarily busy");
    };
    assert.equal(await modalView.refreshOutline(), stableArticle);
    assert.equal(modalView.outline, stableOutline);
    assert.equal(modalView.outlineRetries, 1);
    modalView.web.executeJavaScript = async () => baseline;
    modalView.web.emitEvent("did-stop-loading");
    await modalView.refreshOutline();
    assert.equal(modalView.outline, stableOutline);
    assert.equal(modalView.outlineRetries, 0);
    const added = {
      ...baseline,
      html: baseline.html.replace(
        "</article>",
        `<h3 id="new" data-sb-outline-target="new">New subsection</h3><p>${prose}</p></article>`,
      ),
      headings: [
        ...baseline.headings,
        { key: "new", id: "new", text: "New subsection", level: 3 },
      ],
    };
    modalView.web.executeJavaScript = async () => added;
    await modalView.refreshOutline();
    assert.equal(modalView.outline.length, 4);
    assert.equal(modalView.outline.at(-1).text, "New subsection");
    assert.equal(modalView.outlineCurrent, stableOutline[1].key);
    modalView.web.executeJavaScript = async () => ({
      ...baseline,
      html: `<title>Dynamic article</title><article><p>${prose}</p></article>`,
      headings: [],
    });
    await modalView.refreshOutline();
    assert.equal(modalView.outline.length, 1); // A real content change may remove all headings.
    assert.equal(modalView.outlineCurrent, undefined);
    modalView.web.executeJavaScript = async () => baseline;
    await modalView.refreshOutline();
    modalView.web.emitEvent("did-navigate-in-page", {
      isMainFrame: true,
      url: baseline.url + "#first",
    });
    assert.equal(modalView.outline.length, 3); // An anchor does not invalidate the article.
    modalView.web.emitEvent("did-start-navigation", {
      isMainFrame: true,
      isInPlace: false,
    });
    assert.deepEqual(modalView.outline, []);
    assert.equal(modalView.outlineArticle, undefined);
    modalView.transferring = true;
    modalView.destroy();
    // The host has not yet loaded its global language object at plugin onload.
    const startup = new BrowserPlugin();
    startup.t = (key: string) => key;
    for (const name of [
      "addIcons",
      "addTab",
      "addDock",
      "addCommand",
      "addTopBar",
    ])
      startup[name] = () => {};
    startup.initialize = async () => {};
    startup.eventBus = { on() {} };
    await startup.onload();
    assert.ok(startup.outline);
    startup.outline.destroy();
    const moving = mount("https://moving.example/");
    moving.transferring = true;
    moving.destroy();
    assert.equal(p.config.recentlyClosed.length, 0);
    const unloading = mount("https://unload.example/");
    p.closing = true;
    unloading.destroy();
    assert.equal(p.config.recentlyClosed.length, 0);
    v.destroy();
    assert.equal(p.config.recentlyClosed.length, 0);
  } finally {
    p.closing = true;
    clearTimeout(p.timer);
    for (const view of [...p.views] as any[]) view.destroy();
    dom.window.close();
  }
});
