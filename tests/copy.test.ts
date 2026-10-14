import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { selectedContent } from "../src/copy-selection";
const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://example.com/page",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
});
const doc = dom.window.document;
function select(node: Node, start?: number, end?: number) {
  const range = doc.createRange();
  range.selectNodeContents(node);
  if (start !== undefined) range.setStart(node, start);
  if (end !== undefined) range.setEnd(node, end);
  doc.getSelection()!.removeAllRanges();
  doc.getSelection()!.addRange(range);
}
test("partial selection preserves heading semantics without surrounding text", async () => {
  doc.body.innerHTML = "<h2>前缀选中后缀</h2><p>不要复制</p>";
  select(doc.querySelector("h2")!.firstChild!, 2, 4);
  const selection = selectedContent(doc)!;
  assert.equal(selection.text, "选中");
  assert.equal(selection.html, "<h2>选中</h2>");
  const { enhancedClipboard } = await import("../src/copy");
  const data = enhancedClipboard(selection, {
    Md2BlockDOM(md: string) {
      assert.equal(md, "## 选中");
      return '<div data-type="NodeHeading">选中</div>';
    },
    BlockDOM2HTML() {
      return "<h2>选中</h2>";
    },
  });
  const encoded = data.html.match(/data-siyuan='([^']+)'/)![1];
  assert.equal(Buffer.from(encoded, "base64").toString("utf8"), data.blockDOM);
  assert.equal(data.text, "选中");
});
test("copy preserves code, list and formula through the shared converter", async () => {
  doc.body.innerHTML =
    '<article><ul><li>列表</li></ul><pre><code class="language-js">const x = 1;</code></pre><p><math display="inline" data-latex="x^2">x</math></p></article>';
  select(doc.querySelector("article")!);
  const { enhancedClipboard } = await import("../src/copy");
  enhancedClipboard(selectedContent(doc)!, {
    Md2BlockDOM(md: string) {
      assert.match(md, /- 列表/);
      assert.match(md, /```js\nconst x = 1;/);
      assert.match(md, /x\^2/);
      return "<div>blocks</div>";
    },
    BlockDOM2HTML() {
      return "<p>blocks</p>";
    },
  });
});
test("editable controls and selections outside reader are left alone", () => {
  doc.body.innerHTML =
    '<input value="text"><div id="reader"><p>阅读内容</p></div><p id="outside">外部内容</p>';
  select(doc.querySelector("#outside")!);
  assert.equal(
    selectedContent(doc.querySelector<HTMLElement>("#reader")!),
    null,
  );
  doc.querySelector("input")!.focus();
  assert.equal(selectedContent(doc), null);
});
test("sandboxed preload intercepts trusted page copy and leaves editable/synthetic copies alone", async () => {
  const { build } = await import("esbuild");
  const { runInNewContext } = await import("node:vm");
  const bundle = await build({
    entryPoints: ["src/preload.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  });
  let onCopy: any;
  const sent: any[] = [];
  const local = new JSDOM(
    '<body><h2>测试标题</h2><input value="输入框"></body>',
    { url: "https://example.com/" },
  );
  const range = local.window.document.createRange();
  range.selectNodeContents(local.window.document.querySelector("h2")!);
  local.window.getSelection()!.addRange(range);
  const localDoc = local.window.document;
  const original = localDoc.addEventListener;
  localDoc.addEventListener = ((_name: any, fn: any) => {
    onCopy = fn;
  }) as any;
  runInNewContext(bundle.outputFiles[0].text, {
    document: localDoc,
    require(name: string) {
      assert.equal(name, "electron");
      return {
        ipcRenderer: { sendToHost: (...args: any[]) => sent.push(args) },
      };
    },
  });
  localDoc.addEventListener = original;
  const formats = new Map();
  let prevented = 0;
  const event = {
    isTrusted: true,
    clipboardData: { setData: (k: string, v: string) => formats.set(k, v) },
    preventDefault: () => prevented++,
  };
  onCopy(event);
  assert.equal(prevented, 1);
  assert.equal(sent[0][0], "siyuan-browser-copy");
  assert.equal(sent[0][1].html, "<h2>测试标题</h2>");
  assert.equal(formats.get("text/plain"), "测试标题");
  onCopy({ ...event, isTrusted: false });
  localDoc.querySelector("input")!.focus();
  onCopy(event);
  assert.equal(sent.length, 1);
});
