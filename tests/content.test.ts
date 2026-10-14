import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
});
test("article sanitization retains content without executable elements", async () => {
  const { extract, markdown } = await import("../src/content");
  const result = extract(
    "<article><h1>中文标题</h1><p>" +
      "这里是测试正文。".repeat(80) +
      '</p><img data-src="/image.png" onerror="alert(1)"><script>alert(1)</script><iframe src="file:///secret"></iframe><a href="javascript:alert(1)">bad</a><table><tr><th>A</th></tr><tr><td>B</td></tr></table><pre><code>const x = 1;</code></pre></article>',
    "https://example.com/page",
    "title",
  );
  assert.doesNotMatch(result.html, /<script|<iframe|onerror|javascript:/);
  assert.match(result.html, /https:\/\/example.com\/image.png/);
  const md = markdown(result.html);
  assert.match(md, /中文标题/);
  assert.match(md, /const x = 1/);
});

test("Defuddle retains TeX sources, converts MathML, and preserves document structures", async () => {
  const { readFile } = await import("node:fs/promises");
  const { extract, markdown } = await import("../src/content");
  const source = await readFile("tests/fixtures/math.html", "utf8");
  const article = extract(
    source,
    "https://example.com/article",
    "公式与结构测试",
  );
  const md = markdown(article.html, article.url);
  assert.match(md, /\$E=mc\^2\$/);
  assert.match(md, /\$\$\s*\\int_0\^1 x\^2\\,dx=\\frac\{1\}\{3\}\s*\$\$/);
  assert.match(md, /\\begin\{aligned\}/);
  assert.match(md, /\\frac\{a\}\{b\}/);
  assert.match(md, /\\begin\{pmatrix\}1 & 2 \\\\ 3 & 4\\end\{pmatrix\}/);
  assert.doesNotMatch(md, /重复渲染层|积分渲染副本|<script/);
  assert.match(md, /\[\^1\]/);
  assert.match(md, /\[\^1\]:.*脚注正文/);
  assert.match(md, /\| 名称 \| 值 \|/);
  assert.match(md, /```python\ndef square\(x\):\n    return x \*\* 2/);
  assert.match(md, /https:\/\/example.com\/next/);
  assert.match(md, /https:\/\/example.com\/image.png/);
});

test("selection conversion retains short formulas and saved asset paths", async () => {
  const { extract, markdown } = await import("../src/content");
  const selected = extract(
    '<p>选中 <math display="inline" data-latex="x_1"><msub><mi>x</mi><mn>1</mn></msub></math></p>',
    "https://example.com",
    "选区",
    true,
  );
  assert.match(markdown(selected.html, selected.url), /\$x_1\$/);
  const md = markdown(
    '<p><img src="assets/local.png" alt="本地资源"></p>',
    "https://example.com",
  );
  assert.match(md, /\]\(assets\/local.png\)/);
});
