import { test } from "node:test";
import assert from "node:assert/strict";
import {
  address,
  clampZoom,
  addHistory,
  defaults,
  suggestions,
  readConfig,
  httpURL,
  migrateInternalURL,
  HOME_URL,
} from "../src/core";
test("address distinguishes domains, search, and unsafe protocols", () => {
  assert.equal(address("example.com/a"), "https://example.com/a");
  assert.equal(
    address("中文 测试"),
    "https://duckduckgo.com/?q=%E4%B8%AD%E6%96%87%20%E6%B5%8B%E8%AF%95",
  );
  assert.throws(() => address("javascript:alert(1)"));
  assert.throws(() => address("file:///etc/passwd"));
  assert.throws(() => address("a b", "javascript:%s"));
  assert.equal(address("about:blank"), "about:blank");
  assert.equal(httpURL("https://user:pass@example.com"), false);
});
test("history is bounded and most recent URL wins", () => {
  const list = Array.from({ length: 1000 }, (_, i) => ({
    url: `https://example.com/${i}`,
    title: String(i),
    time: i,
  }));
  const result = addHistory(list, {
    url: "https://example.com/500",
    title: "new",
    time: 1001,
  });
  assert.equal(result.length, 1000);
  assert.equal(result[0].title, "new");
  assert.equal(new Set(result.map((e) => e.url)).size, 1000);
  assert.equal(
    addHistory(result, { url: "about:blank", title: "", time: 0 }).length,
    1000,
  );
});
test("bookmarks take precedence in merged suggestions", () => {
  const a = { url: "https://example.com", title: "Bookmarked title", time: 0 };
  const c = { ...defaults, bookmarks: [a], history: [{ ...a, title: "old" }] };
  assert.deepEqual(suggestions(c, "example"), [a]);
});
test("persisted invalid data cannot introduce executable URLs", () => {
  const c = readConfig({
    history: [{ url: "javascript:1", title: "bad" }],
    updateDays: 100,
    subscriptions: ["file:///x", "https://example.com/list"],
  });
  assert.equal(c.history.length, 0);
  assert.equal(c.updateDays, 24);
  assert.deepEqual(c.subscriptions, ["https://example.com/list"]);
  assert.equal(clampZoom(9), 3);
  assert.equal(clampZoom(0.1), 0.5);
});
test("default filter subscriptions use the responsive official download host", () => {
  assert.deepEqual(defaults.subscriptions, [
    "https://easylist-downloads.adblockplus.org/easylist.txt",
    "https://easylist-downloads.adblockplus.org/easyprivacy.txt",
  ]);
  assert.ok(defaults.subscriptions.every(httpURL));
  assert.equal(defaults.updateDays, 4);
});
test("removed internal library pages fall back to the home page", () => {
  // Layouts saved before 0.1.3 still point at the deleted library pages, and
  // address() rejects unknown protocols, so the migration has to run first.
  assert.equal(migrateInternalURL("siyuan-browser://bookmarks"), HOME_URL);
  assert.equal(migrateInternalURL("siyuan-browser://history"), HOME_URL);
  assert.equal(migrateInternalURL(HOME_URL), HOME_URL);
  assert.equal(
    migrateInternalURL("https://example.com/a"),
    "https://example.com/a",
  );
  assert.throws(() => address("siyuan-browser://bookmarks"));
});
