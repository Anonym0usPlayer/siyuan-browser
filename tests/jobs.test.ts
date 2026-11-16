import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("save tasks can be cleared one by one or all at once, in every open dialog", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://127.0.0.1:6806/",
    pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    document: dom.window.document,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  const bundle = await build({
    stdin: { contents: 'export { default as BrowserPlugin } from "./src/index";', resolveDir: process.cwd() },
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
          export class Plugin {};
          export class Menu { addItem() {} addSeparator() {} open() {} };
          export class Dialog {
            constructor(o) {
              this.o = o;
              this.element = document.createElement("div");
              this.element.className = "b3-dialog";
              this.element.innerHTML = '<div class="b3-dialog__header">' + o.title + '</div><div class="b3-dialog__body">' + o.content + '</div>';
              document.body.append(this.element);
            }
            destroy() { this.element.remove(); this.o?.destroyCallback?.(); }
          };
          export class Setting { addItem() {} };
          export function showMessage() {};
          export function saveLayout(fn) { fn(); };
          export function getAllModels() { return {outline: []}; };
          export function openTab(options) { return Promise.resolve({ options }); };
          export function openWindow() {};
          export function getFrontend() { return 'desktop'; };
        `,
          }));
          builder.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
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
  const { BrowserPlugin } = module.exports;
  const p = new BrowserPlugin();
  p.t = (key: string) => key;
  const writes: any[] = [];
  p.saveData = (name: string, data: any) => {
    writes.push([name, JSON.parse(JSON.stringify(data))]);
    return Promise.resolve();
  };
  const job = (title: string) => ({
    article: { title, url: "https://example.com/" + title },
    resources: {},
    body: "done",
    cancelled: false,
    snapshot: "assets/web-1.mhtml",
    docId: "doc-" + title,
  });
  p.jobs = [job("one"), job("two"), job("three")];

  p.showJobs();
  p.showJobs();
  const [first, second] = [...document.querySelectorAll(".b3-dialog")];
  const rows = (root: Element) => [
    ...root.querySelectorAll(".sb-job"),
  ] as HTMLElement[];
  const buttonIn = (root: Element, label: string) =>
    [...root.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    ) as HTMLButtonElement;

  // The bulk action lives in the dialog header, next to the title, and is only
  // enabled while there is something to clear.
  const clearAll = buttonIn(first, "clearAllJobs");
  assert.ok(clearAll, "clear-all sits outside the rewritten list");
  assert.equal(clearAll.disabled, false);
  assert.equal(rows(first).length, 3);
  assert.equal(rows(second).length, 3);

  // One row: its own button drops that entry, stops it if it was still running,
  // and the change is persisted and reflected in the other open dialog too.
  buttonIn(rows(first)[1], "clearJob").click();
  assert.deepEqual(
    p.jobs.map((j: any) => j.article.title),
    ["one", "three"],
  );
  assert.equal(p.jobs.every((j: any) => j.cancelled === false), true);
  assert.equal(writes.at(-1)[0], "jobs.json");
  assert.equal(writes.at(-1)[1].length, 2);
  assert.equal(rows(first).length, 2);
  assert.equal(rows(second).length, 2);

  // All of them: the list empties, says so, and the button disables itself.
  clearAll.click();
  assert.equal(p.jobs.length, 0);
  assert.equal(writes.at(-1)[1].length, 0);
  assert.equal(rows(first).length, 0);
  for (const dialog of [first, second]) {
    assert.equal(
      dialog.querySelector(".sb-job-empty")!.textContent,
      "noJobs",
    );
    assert.equal(buttonIn(dialog, "clearAllJobs").disabled, true);
  }

  // A cancelled job still in the list reports it, as before.
  p.jobs = [Object.assign(job("four"), { cancelled: true })];
  p.showJobs();
  assert.match(
    [...document.querySelectorAll(".sb-job p")].at(-1)!.textContent!,
    /^body: cancelled;/,
  );
  dom.window.close();
});
