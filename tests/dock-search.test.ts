import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { installDockSearch } from "../src/dock-search";

test("dock search reveals only on a downward pull at the top and Escape clears filtering", () => {
  const dom = new JSDOM("<div><input></div>");
  const oldDocument = globalThis.document;
  const oldEvent = globalThis.Event;
  Object.assign(globalThis, {
    document: dom.window.document,
    Event: dom.window.Event,
  });
  try {
    const list = document.querySelector("div")!;
    const search = document.querySelector("input")!;
    installDockSearch(list, search);
    assert.equal(search.hidden, true);
    const wheel = (deltaY: number) =>
      list.dispatchEvent(new dom.window.WheelEvent("wheel", { deltaY }));
    wheel(70);
    assert.equal(search.hidden, true);
    list.scrollTop = 100;
    wheel(-70);
    assert.equal(search.hidden, true);
    list.scrollTop = 0;
    wheel(-10);
    assert.equal(search.hidden, true);
    wheel(-35);
    assert.equal(search.hidden, false);
    // Regression: short/empty lists have no scroll event, but upward wheel must collapse.
    assert.equal(list.scrollHeight, 0);
    search.focus();
    wheel(45);
    assert.equal(search.hidden, true);
    wheel(-45);
    assert.equal(search.hidden, false);
    search.value = "example";
    let filtered = "example";
    search.addEventListener("input", () => {
      filtered = search.value;
    });
    list.scrollTop = 100;
    list.dispatchEvent(new dom.window.Event("scroll"));
    assert.equal(search.hidden, false, "do not hide an active filter");
    search.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    assert.equal(search.hidden, true);
    assert.equal(filtered, "");
    list.scrollTop = 0;
    list.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "ArrowUp" }),
    );
    assert.equal(search.hidden, false);
    assert.equal(document.activeElement, search);
  } finally {
    Object.assign(globalThis, { document: oldDocument, Event: oldEvent });
    dom.window.close();
  }
});

test("explicit collapse hides the entire search row and clears a live filter", () => {
  const dom = new JSDOM("<div id='list'><div id='row'><input><button>Close</button></div></div>");
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const list = document.getElementById("list")!;
    const row = document.getElementById("row")!;
    const search = document.querySelector("input")!;
    const control = installDockSearch(list, search, row);
    assert.equal(row.hidden, true);
    control.show();
    search.value = "query";
    let updates = 0;
    search.addEventListener("input", () => updates++);
    document.querySelector("button")!.addEventListener("click", control.hide);
    document.querySelector("button")!.click();
    assert.equal(row.hidden, true);
    assert.equal(search.hidden, true);
    assert.equal(search.value, "");
    assert.equal(updates, 1);
  } finally { globalThis.document = previous; dom.window.close(); }
});
