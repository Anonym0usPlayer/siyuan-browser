import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { appearanceMode, watchAppearance } from "../src/scheme";

test("the guest scheme follows SiYuan's own mode, not the system preference", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://127.0.0.1:6806/",
    pretendToBeVisual: true,
  });
  const doc = dom.window.document;
  const html = doc.documentElement;
  globalThis.MutationObserver = dom.window.MutationObserver;

  // The host stamps the resolved mode on the root element, including when its
  // own setting is "follow the system".
  html.setAttribute("data-theme-mode", "dark");
  assert.equal(appearanceMode(doc), "dark");
  html.setAttribute("data-theme-mode", "light");
  assert.equal(appearanceMode(doc), "light");

  // An older host only exposes the setting: 0 light, 1 dark.
  html.removeAttribute("data-theme-mode");
  (dom.window as any).siyuan = { config: { appearance: { mode: 1 } } };
  assert.equal(appearanceMode(doc), "dark");
  (dom.window as any).siyuan.config.appearance.mode = 0;
  assert.equal(appearanceMode(doc), "light");
  delete (dom.window as any).siyuan;
  assert.equal(appearanceMode(doc), "light", "the host default is light");

  // Clicks on the theme switch only swap the attribute, so that is what has to
  // be observed — and the same value twice must not restyle the guests again.
  const seen: string[] = [];
  html.setAttribute("data-theme-mode", "light");
  const stop = watchAppearance(doc, (mode) => seen.push(mode));
  assert.deepEqual(seen, ["light"]);
  html.setAttribute("data-theme-mode", "dark");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ["light", "dark"]);
  html.setAttribute("data-theme-mode", "dark");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ["light", "dark"]);
  stop();
  html.setAttribute("data-theme-mode", "light");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ["light", "dark"], "a disposed watcher stays quiet");
  dom.window.close();
});
