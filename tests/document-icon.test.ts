import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { DocumentIconRefresh } from "../src/document-icon";

test("refreshes existing and late file rows without replacing row state, then cleans up", async () => {
  const dom = new JSDOM(
    '<body><li data-node-id="20261026120000-abcdefg" data-default-icon="file" class="selected"><span class="b3-list-item__icon"><svg></svg></span><span>Title</span></li></body>',
  );
  const saved = {
    document: globalThis.document,
    MutationObserver: globalThis.MutationObserver,
  };
  Object.assign(globalThis, {
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  const refresh = new DocumentIconRefresh();
  try {
    const row = document.querySelector("li")!;
    refresh.update("20261026120000-abcdefg", "https://example.com/icon.png");
    assert.equal(
      row.querySelector("img")?.getAttribute("src"),
      "https://example.com/icon.png",
    );
    assert.equal(row.hasAttribute("data-default-icon"), false);
    assert.equal(row.className, "selected");
    refresh.update("20261026120001-abcdefg", "https://example.com/new.png");
    const late = row.cloneNode(true) as HTMLElement;
    late.dataset.nodeId = "20261026120001-abcdefg";
    document.body.append(late);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(
      late.querySelector("img")?.getAttribute("src"),
      "https://example.com/new.png",
    );
    refresh.dispose();
    late.querySelector("img")!.setAttribute("src", "unchanged");
    document.body.append(document.createElement("div"));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(late.querySelector("img")?.getAttribute("src"), "unchanged");
  } finally {
    refresh.dispose();
    Object.assign(globalThis, saved);
    dom.window.close();
  }
});
