import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("address editing and IME confirmation do not navigate; explicit Enter does", async () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  Object.assign(globalThis, { document: dom.window.document });
  const result = await build({
    entryPoints: ["src/view.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "siyuan-stub",
        setup(build) {
          build.onResolve({ filter: /^siyuan$/ }, () => ({
            path: "siyuan",
            namespace: "stub",
          }));
          build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents:
              "export class Menu {}; export class Dialog {}; export function openWindow() {}",
          }));
        },
      },
    ],
  });
  const module = { exports: {} as any };
  new Function("module", "exports", result.outputFiles[0].text)(
    module,
    module.exports,
  );
  const { BrowserView } = module.exports;
  const view = new BrowserView(
    {
      t: (s: string) => s,
      persist() {},
      config: {
        engine: "DuckDuckGo",
        customSearch: "https://duckduckgo.com/?q=%s",
        bookmarks: [{ title: "Example", url: "https://example.com", time: 0 }],
        history: [],
      },
      adapter: { reason: "test", external() {} },
    },
    {
      element: document.createElement("div"),
      tab: { headElement: document.createElement("div") },
    },
    {},
  );
  const navigated: string[] = [];
  view.navigate = (s: string) => navigated.push(s);
  const key = (init: KeyboardEventInit = {}) =>
    view.bar.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "Enter",
        cancelable: true,
        ...init,
      }),
    );
  for (const value of ["中文搜索", "example.com/path"]) {
    view.bar.value = value;
    view.bar.dispatchEvent(new dom.window.Event("input"));
    view.bar.dispatchEvent(new dom.window.CompositionEvent("compositionstart"));
    key();
    key({ key: "ArrowDown" });
    assert.equal(view.suggestionIndex, -1);
    view.bar.dispatchEvent(new dom.window.CompositionEvent("compositionend"));
    key({ isComposing: true });
    key({ keyCode: 229 });
    assert.deepEqual(navigated, []);
  }
  key();
  assert.deepEqual(navigated, ["https://example.com/path"]);
  view.bar.value = "中文搜索";
  view.bar.dispatchEvent(new dom.window.Event("input"));
  key();
  assert.deepEqual(navigated, [
    "https://example.com/path",
    "https://duckduckgo.com/?q=%E4%B8%AD%E6%96%87%E6%90%9C%E7%B4%A2",
  ]);
  view.bar.value = "example";
  view.bar.dispatchEvent(new dom.window.Event("input"));
  key({ key: "ArrowDown" });
  key();
  assert.equal(navigated.at(-1), "https://example.com");
  // Moving back to the default row restores the typed draft.
  view.bar.value = "example";
  view.bar.dispatchEvent(new dom.window.Event("input"));
  key({ key: "ArrowDown" });
  assert.equal(view.bar.value, "https://example.com");
  key({ key: "ArrowUp" });
  assert.equal(view.bar.value, "example");
  key({ key: "ArrowDown" });
  key({ key: "Escape" });
  assert.equal(view.bar.value, "example");
  assert.equal(view.suggestionIndex, -1);
  key();
  assert.equal(navigated.at(-1), "example");
  view.url = "https://current.example/page";
  key({ key: "Escape" });
  assert.equal(view.bar.value, view.url);
  view.bar.value = "unfinished input";
  view.bar.dispatchEvent(new dom.window.Event("input"));
  const count = navigated.length;
  view.bar.dispatchEvent(new dom.window.Event("blur"));
  assert.equal(view.bar.value, view.url);
  assert.equal(view.suggestionIndex, -1);
  assert.equal(navigated.length, count);
  view.bar.value = "";
  view.bar.dispatchEvent(new dom.window.Event("input"));
  key();
  assert.equal(navigated.length, count);
  // Pointer selection stays focused and commits only on click.
  view.bar.value = "example";
  view.bar.dispatchEvent(new dom.window.Event("input"));
  const candidate = view.suggest.children[1];
  candidate.dispatchEvent(
    new dom.window.MouseEvent("mousedown", { cancelable: true }),
  );
  assert.equal(navigated.length, count);
  candidate.click();
  assert.equal(navigated.at(-1), "https://example.com");
  assert.equal(view.suggestionIndex, -1);
  view.root.append(view.bar);
  view.bar.focus();
  view.bar.value = "exam";
  view.bar.setSelectionRange(4, 4);
  view.bar.dispatchEvent(
    new dom.window.InputEvent("input", { inputType: "insertText" }),
  );
  assert.equal(view.bar.value, "example.com");
  assert.equal(view.bar.selectionStart, 4);
  assert.equal(view.bar.selectionEnd, 11);
  key();
  assert.equal(navigated.at(-1), "https://example.com");
  view.bar.value = "exam";
  view.bar.dispatchEvent(
    new dom.window.InputEvent("input", { inputType: "deleteContentBackward" }),
  );
  assert.equal(view.bar.value, "exam");
  view.bar.dispatchEvent(new dom.window.Event("blur"));
  view.plugin.config.history = [
    { title: "Old page", url: "https://old.example", time: 1 },
  ];
  view.bar.value = "Old page";
  view.bar.dispatchEvent(new dom.window.Event("input"));
  const beforeDelete = navigated.length;
  view.suggest.querySelector(".sb-suggestion-remove").click();
  assert.equal(view.plugin.config.history.length, 0);
  assert.equal(navigated.length, beforeDelete);
  view.bar.dispatchEvent(new dom.window.Event("blur"));
  dom.window.close();
});
