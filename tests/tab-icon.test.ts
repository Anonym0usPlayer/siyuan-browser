import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { setTabFavicon, setTabLoading } from "../src/tab-icon";

test("loading replaces the leading graphic while retaining favicons and native tab controls", () => {
  const dom = new JSDOM(
    '<div id="head"><svg class="item__graphic"></svg><span class="item__text">Example</span><button class="item__close">Close</button></div>',
  );
  Object.assign(globalThis, { document: dom.window.document });
  const head = document.getElementById("head")!;
  const close = head.querySelector(".item__close");
  const fallback = head.querySelector<SVGElement>("svg")!;
  try {
    setTabFavicon(head, "data:image/png;base64,first");
    const first = head.querySelector(".sb-tab-favicon");
    setTabLoading(head, true, "Loading");
    const spinner = head.querySelector(".sb-tab-spinner");
    setTabLoading(head, true, "Loading");
    assert.equal(head.querySelectorAll(".sb-tab-spinner").length, 1);
    assert.equal(head.querySelector(".sb-tab-spinner"), spinner);
    assert.equal(head.querySelector(".sb-tab-favicon"), first);
    assert.equal(head.getAttribute("aria-busy"), "true");
    assert.equal(spinner?.getAttribute("aria-label"), "Loading");
    setTabFavicon(head, "data:image/png;base64,second");
    assert.equal(head.querySelector(".sb-tab-spinner"), spinner);
    assert.equal(
      head.querySelector("img")?.src,
      "data:image/png;base64,second",
    );
    setTabLoading(head, false);
    assert.equal(head.querySelector(".sb-tab-spinner"), null);
    assert.equal(head.classList.contains("sb-tab-loading"), false);
    assert.equal(head.hasAttribute("aria-busy"), false);
    assert.equal(
      head.querySelector("img")?.src,
      "data:image/png;base64,second",
    );
    assert.equal(fallback.style.display, "none");
    setTabLoading(head, true);
    setTabFavicon(head);
    assert.ok(head.querySelector(".sb-tab-spinner"));
    setTabLoading(head, false);
    assert.equal(fallback.style.display, "");
    assert.equal(head.querySelector(".item__text")?.textContent, "Example");
    assert.equal(head.querySelector(".item__close"), close);
  } finally {
    dom.window.close();
  }
});

test("icon-only tabs retain the favicon when loading stops", () => {
  const dom = new JSDOM(
    '<div id="head"><svg class="item__graphic"></svg></div>',
  );
  Object.assign(globalThis, { document: dom.window.document });
  const head = document.getElementById("head")!;
  try {
    setTabLoading(head, true, "Loading");
    assert.equal(
      head.firstElementChild?.classList.contains("sb-tab-spinner"),
      true,
    );
    setTabFavicon(head, "data:image/png;base64,icon");
    setTabLoading(head, false);
    assert.equal(head.firstElementChild?.tagName, "IMG");
    assert.equal(head.querySelector(".sb-tab-spinner"), null);
  } finally {
    dom.window.close();
  }
});
