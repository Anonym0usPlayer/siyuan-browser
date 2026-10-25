import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  articleOutline,
  collectOutlineSource,
  scrollToPageHeading,
  BrowserOutline,
  observeOutlineChanges,
} from "../src/outline";

function setup(html = "") {
  const dom = new JSDOM(html, {
    url: "https://example.com/article",
    runScripts: "outside-only",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    DOMParser: dom.window.DOMParser,
    MutationObserver: dom.window.MutationObserver,
  });
  return dom;
}

test("reader outline excludes site navigation and preserves duplicate heading targets", async () => {
  const dom =
    setup(`<title>Article</title><nav><h2>Navigation</h2><p>${"links ".repeat(40)}</p></nav>
    <article><h1>Article</h1><p>${"Main article prose. ".repeat(100)}</p>
    <h2>Repeat</h2><p>${"First section. ".repeat(100)}</p>
    <h3>Detail</h3><p>${"Details. ".repeat(100)}</p>
    <h2>Repeat</h2><p>${"Second section. ".repeat(100)}</p></article>`);
  const source = dom.window.eval(collectOutlineSource("")) as {
    html: string;
    url: string;
    title: string;
    headings: import("../src/outline").SourceHeading[];
  };
  const { extract } = await import("../src/content");
  const article = extract(source.html, source.url, source.title);
  const entries = articleOutline(article, source.headings);
  assert.ok(!entries.some((h) => h.text === "Navigation"));
  const repeats = entries.filter((h) => h.text === "Repeat");
  assert.equal(repeats.length, 2);
  assert.notEqual(repeats[0].target?.key, repeats[1].target?.key);
  let scrolled: Element | undefined;
  dom.window.HTMLElement.prototype.scrollIntoView = function () {
    scrolled = this;
  };
  assert.equal(dom.window.eval(scrollToPageHeading(repeats[1])), true);
  assert.equal(scrolled, dom.window.document.querySelectorAll("article h2")[1]);
  assert.equal(entries.find((h) => h.text === "Detail")?.level, 3);
});

test("normalized text and source ids survive extractor attribute removal", () => {
  setup();
  const entries = articleOutline(
    {
      title: "Title",
      url: "https://example.com",
      fallback: false,
      html: '<h2 id="part">Hello <em>world</em></h2><h2>Hello world</h2>',
    },
    [
      { key: "one", id: "part", text: "Hello world", level: 2 },
      { key: "two", id: "", text: "Hello world", level: 2 },
    ],
  );
  assert.deepEqual(
    entries.slice(1).map((h) => h.target?.key),
    ["one", "two"],
  );
  assert.deepEqual(
    entries.map((h) => h.readerIndex),
    [-1, 0, 1],
  );
});

test("modal UI is excluded and source targets remain stable when headings move", () => {
  const dom = setup(
    '<article><h1>Article</h1><h2>Section</h2></article><div role="dialog"><h2>Sign in</h2><p>Login required</p></div>',
  );
  const modal = document.querySelector<HTMLElement>('[role="dialog"]')!;
  modal.getClientRects = () => [{ width: 200 }] as unknown as DOMRectList;
  const before = dom.window.eval(collectOutlineSource("")) as any;
  assert.equal(before.transient, true);
  assert.doesNotMatch(before.html, /Sign in|Login required/);
  assert.equal(before.headings.length, 2);
  const key = before.headings[1].key;
  const extra = document.createElement("h2");
  extra.textContent = "Inserted";
  document.querySelector("article")!.prepend(extra);
  modal.style.display = "none";
  const after = dom.window.eval(collectOutlineSource("")) as any;
  assert.equal(after.transient, false);
  assert.equal(after.headings.find((h: any) => h.text === "Section").key, key);
  dom.window.close();
});

test("visibility changes and a heading-free modal dismissal notify the outline observer", async () => {
  const dom = setup(
    '<main><h1>Article</h1><p>Content</p></main><div role="dialog" style="display:none"><iframe></iframe><button>Close</button></div>',
  );
  const signals: string[] = [];
  dom.window.console.debug = (signal: string) => {
    signals.push(signal);
  };
  dom.window.eval(observeOutlineChanges("outline-change"));
  dom.window.eval(collectOutlineSource(""));
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.deepEqual(signals, []); // Marking source headings must not refresh itself.
  const modal = document.querySelector<HTMLElement>('[role="dialog"]')!;
  modal.style.display = "block";
  document.querySelector("main")!.setAttribute("aria-hidden", "true");
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.deepEqual(signals, ["outline-change"]);
  modal.remove();
  document.querySelector("main")!.removeAttribute("aria-hidden");
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.deepEqual(signals, ["outline-change", "outline-change"]);
  dom.window.close();
});

test("page jump keeps the heading below a fixed navigation bar", () => {
  const dom = setup(
    '<header style="position:fixed;top:0">Menu</header><h2 id="part">Section</h2>',
  );
  const header = document.querySelector("header")!;
  const heading = document.querySelector("h2")!;
  heading.getBoundingClientRect = () =>
    ({ left: 100, width: 400, top: 0 }) as DOMRect;
  header.getBoundingClientRect = () => ({ top: 0, bottom: 64 }) as DOMRect;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.assign(document, { elementsFromPoint: () => [header] });
  let offset = 0;
  dom.window.scrollBy = ((options: ScrollToOptions) => {
    offset = options.top || 0;
  }) as typeof window.scrollBy;
  const found = dom.window.eval(
    scrollToPageHeading({
      key: "part",
      text: "Section",
      level: 2,
      readerIndex: 0,
      target: { key: "source", id: "part", text: "Section", level: 2 },
    }),
  );
  assert.equal(found, true);
  assert.equal(offset, -76);
  dom.window.close();
});

test("native dock switches browser outlines, restores notes, supports collapse and keyboard jump", async () => {
  const dom = setup(
    '<div class="layout__wnd layout__wnd--active"><ul class="layout-tab-bar"><li id="web" class="item item--focus" data-type="tab-header"></li><li id="note" class="item" data-type="tab-header"></li></ul></div><div class="sy__outline"><div class="block__icons">Native tools</div><div id="native">Note outline</div></div>',
  );
  const panel = document.querySelector<HTMLElement>(".sy__outline")!;
  const entry = {
    key: "root",
    text: "<script>unsafe</script>",
    level: 1,
    readerIndex: -1,
  };
  const child = { key: "child", text: "Child", level: 3, readerIndex: 0 };
  let jumped = "";
  const view = {
    disposed: false,
    custom: { tab: { headElement: document.getElementById("web") } },
    outline: [entry, child],
    outlineLoading: false,
    jumpToHeading: async (h: typeof entry) => {
      jumped = h.key;
    },
  };
  const controller = new BrowserOutline(
    () => [view],
    () => [panel],
    "Empty",
    "Loading",
    (fn) => {
      void fn();
    },
  );
  await Promise.resolve();
  assert.ok(panel.classList.contains("sb-outline-host"));
  assert.equal(panel.querySelectorAll(".sb-outline script").length, 0);
  const root = panel.querySelector<HTMLElement>('[data-outline-key="root"]')!;
  root.querySelector<HTMLElement>(".b3-list-item__toggle")!.click();
  assert.equal(root.getAttribute("aria-expanded"), "false");
  root.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter" }));
  assert.equal(jumped, "root");
  document.getElementById("web")!.classList.remove("item--focus");
  document.getElementById("note")!.classList.add("item--focus");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(panel.querySelector(".sb-outline"), null);
  assert.equal(panel.classList.contains("sb-outline-host"), false);
  assert.equal(document.getElementById("native")!.textContent, "Note outline");
  document.getElementById("note")!.classList.remove("item--focus");
  document.getElementById("web")!.classList.add("item--focus");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(panel.querySelector(".sb-outline"));
  controller.destroy();
  assert.equal(panel.querySelector(".sb-outline"), null);
  assert.equal(panel.classList.contains("sb-outline-host"), false);
  dom.window.close();
});

test("heading signature skips the document snapshot until structure changes", () => {
  const dom = setup(
    "<article><h1>Article</h1><h2>Section</h2><p>Body</p></article>",
  );
  const first = dom.window.eval(collectOutlineSource("")) as any;
  assert.equal(first.unchanged, undefined);
  assert.match(first.html, /Section/);
  const again = dom.window.eval(collectOutlineSource(first.signature)) as any;
  assert.equal(again.unchanged, true);
  assert.equal(again.html, undefined);
  document.body.classList.add("theme-dark");
  const styled = dom.window.eval(collectOutlineSource(first.signature)) as any;
  assert.equal(styled.unchanged, true);
  document.querySelector("article")!.append(document.createElement("figure"));
  const structure = dom.window.eval(
    collectOutlineSource(first.signature),
  ) as any;
  assert.equal(structure.unchanged, undefined);
  assert.notEqual(structure.signature, first.signature);
  dom.window.close();
});

test("collapsed branches and focus survive a content refresh", async () => {
  const dom = setup(
    '<div class="layout__wnd layout__wnd--active"><ul class="layout-tab-bar"><li id="web" class="item item--focus" data-type="tab-header"></li></ul></div><div class="sy__outline"></div>',
  );
  const panel = document.querySelector<HTMLElement>(".sy__outline")!;
  const entry = { key: "root", text: "Root", level: 1, readerIndex: -1 };
  const child = { key: "child", text: "Child", level: 2, readerIndex: 0 };
  const view = {
    disposed: false,
    custom: { tab: { headElement: document.getElementById("web") } },
    outline: [entry, child],
    outlineLoading: false,
    outlineCurrent: "child",
    jumpToHeading: async () => {},
  };
  const controller = new BrowserOutline(
    () => [view],
    () => [panel],
    "Empty",
    "Loading",
    (fn) => {
      void fn();
    },
  );
  await Promise.resolve();
  const focused = () =>
    panel.querySelector<HTMLElement>(".b3-list-item--focus")?.dataset
      .outlineKey;
  assert.equal(focused(), "child");
  const root = panel.querySelector<HTMLElement>('[data-outline-key="root"]')!;
  root.querySelector<HTMLElement>(".b3-list-item__toggle")!.click();
  assert.equal(root.getAttribute("aria-expanded"), "false");
  view.outline = [{ ...entry }, { ...child }];
  view.outlineCurrent = "root";
  controller.refresh();
  const refreshed = panel.querySelector<HTMLElement>(
    '[data-outline-key="root"]',
  )!;
  assert.equal(refreshed.getAttribute("aria-expanded"), "false");
  const branch = refreshed.nextElementSibling as HTMLElement | null;
  assert.equal(branch?.className, "b3-list");
  assert.equal(branch?.hidden, true);
  assert.equal(focused(), "root");
  controller.refresh();
  assert.equal(panel.querySelectorAll(".b3-list-item--focus").length, 1);
  controller.destroy();
  dom.window.close();
});
