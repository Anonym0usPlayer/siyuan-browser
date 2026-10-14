import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/core";
import { addressCandidates, inlineCompletion } from "../src/omnibox";
const config = {
  ...defaults,
  engine: "Google",
  history: [
    { title: "ChatGPT", url: "https://chatgpt.com", time: 1 },
    { title: "购物车", url: "https://shop.example/cart", time: 2 },
  ],
};
test("omnibox mixes explicit search, provider terms and local titles", () => {
  const items = addressCandidates(config, "车", [
    "车",
    "车质网",
    "车架号查询",
    "车质网",
  ]);
  assert.deepEqual(
    items.map((i) => i.kind),
    ["search", "search", "search", "history"],
  );
  assert.equal(items[0].value, "https://www.google.com/search?q=%E8%BD%A6");
  assert.equal(items.at(-1)?.title, "购物车");
  assert.equal(addressCandidates(config, "example.com")[0].kind, "url");
});
test("inline completion preserves the typed prefix and only completes URL prefixes", () => {
  assert.equal(inlineCompletion(config, "htt"), "https://chatgpt.com");
  assert.equal(inlineCompletion(config, "chat"), "chatgpt.com");
  assert.equal(inlineCompletion(config, "车"), undefined);
  assert.equal(inlineCompletion(config, "gpt"), undefined);
});
