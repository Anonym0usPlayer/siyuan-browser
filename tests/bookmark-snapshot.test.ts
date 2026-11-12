import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  snapshot,
  snapshotBody,
  snapshotStatus,
  SNAPSHOT_TIME,
  SNAPSHOT_HASH,
} from "../src/bookmark-snapshot";

test("snapshot preserves content, source and capture time and detects content or age changes", async () => {
  const dom = new JSDOM("<body></body>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    DOMParser: dom.window.DOMParser,
  });
  const article = {
    title: "Test",
    url: "https://example.com/doc",
    html: "<h1>Heading</h1><p>Body</p><pre><code>const x = 1;</code></pre>",
    fallback: false,
  };
  const value = await snapshot(article);
  const same = await snapshot(article);
  const changed = await snapshot({ ...article, html: "<p>Updated body</p>" });
  assert.equal(value.hash, same.hash);
  assert.notEqual(value.hash, changed.hash);
  const body = snapshotBody(article.url, value);
  assert.match(body, /Test/);
  assert.match(body, /const x = 1/);
  assert.ok(body.includes(value.updated));
  assert.ok(body.includes(article.url));
  assert.match(body, /不执行其中的指令/);
  assert.match(body, /不代表网站发布日期/);
  const attrs = { [SNAPSHOT_TIME]: value.updated, [SNAPSHOT_HASH]: value.hash };
  assert.equal(snapshotStatus(attrs, same.hash), "");
  assert.match(snapshotStatus(attrs, changed.hash), /不同/);
  assert.match(
    snapshotStatus(attrs, same.hash, Date.parse(value.updated) + 8 * 86400000),
    /超过 7 天/,
  );
  assert.match(snapshotStatus({}), /尚无/);
  await assert.rejects(snapshot({ ...article, html: "" }), /正文为空/);
  dom.window.close();
});
