import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { takeoverUILink } from "../src/link-takeover";

test("marketplace links are taken at the click, editor and browser links are not", () => {
  const dom = new JSDOM(
    `<body>
      <div class="bazaar"><a id="card" href="https://github.com/siyuan-note/siyuan"><span id="inner">repo</span></a></div>
      <div class="protyle"><a id="note" href="https://example.com/note">note</a></div>
      <div class="sb-tab-surface"><a id="browser" href="https://example.com/page">page</a></div>
      <a id="deep" href="siyuan://blocks/20240101">block</a>
      <a id="script" href="javascript:alert(1)">script</a>
    </body>`,
    { url: "http://127.0.0.1:6806/" },
  );
  const doc = dom.window.document;
  const taken: string[] = [];
  const open = (url: string) => taken.push(url);
  // The plugin wires this as a capture-phase document listener; the test uses
  // the same shape so `target` and `defaultPrevented` behave like the real page.
  let result: boolean | undefined;
  doc.addEventListener(
    "click",
    (event) => {
      result = takeoverUILink(event as MouseEvent, open);
    },
    true,
  );
  const fire = (id: string, init: MouseEventInit = {}) => {
    taken.length = 0;
    result = undefined;
    const event = new dom.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    doc.getElementById(id)!.dispatchEvent(event);
    return { result, prevented: event.defaultPrevented, taken: [...taken] };
  };
  const repo = doc.getElementById("card")!.getAttribute("href")!;

  // The Bazaar draws plain anchors and skips them in its own handler, so the
  // click only reaches the host's window-open path — unless it is taken here,
  // before that default runs, with a child node or the anchor itself.
  for (const id of ["card", "inner"]) {
    const hit = fire(id);
    assert.equal(hit.result, true, id);
    assert.equal(hit.prevented, true, id);
    assert.deepEqual(hit.taken, [new URL(repo).href], id);
  }

  // Links the editor already reports through `open-link`, and links inside the
  // browser surface, keep their own semantics.
  for (const id of ["note", "browser", "deep", "script"]) {
    const miss = fire(id);
    assert.equal(miss.result, false, id);
    assert.equal(miss.prevented, false, id);
    assert.deepEqual(miss.taken, [], id);
  }

  // Modifier and non-primary clicks keep their host meaning.
  for (const init of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ]) {
    const key = JSON.stringify(init);
    const miss = fire("card", init);
    assert.equal(miss.result, false, key);
    assert.deepEqual(miss.taken, [], key);
  }
  dom.window.close();
});
