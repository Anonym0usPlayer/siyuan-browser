import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { TabSurface, watchTabDrag } from "../src/tab-surface";

test("moving a native panel keeps the guest connected and follows visibility and bounds", async () => {
  const dom = new JSDOM(
    '<body><div id="left"><div id="panel"></div></div><div id="right"></div></body>',
    { pretendToBeVisual: true },
  );
  const doc = dom.window.document;
  const originalMutation = globalThis.MutationObserver;
  const originalResize = globalThis.ResizeObserver;
  let disconnected = false;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {
      disconnected = true;
    }
  };
  try {
    const anchor = doc.getElementById("panel")!;
    // The rounded host panel is the element around the anchor, not the anchor.
    const wrapper = doc.getElementById("left")!;
    const radii = new Map<Element, string>([[wrapper, "12px"]]);
    const computed = dom.window.getComputedStyle.bind(dom.window);
    dom.window.getComputedStyle = ((node: Element) => {
      const style = computed(node);
      const radius = radii.get(node);
      if (!radius) return style;
      return new Proxy(style, {
        get: (target, key) =>
          key === "borderTopLeftRadius" ? radius : (target as any)[key],
      });
    }) as typeof dom.window.getComputedStyle;
    let rect = { left: 100, top: 50, width: 600, height: 400 };
    let shown = true;
    anchor.getBoundingClientRect = () => rect as DOMRect;
    anchor.getClientRects = () =>
      (shown ? [rect] : []) as unknown as DOMRectList;
    const surface = new TabSurface(anchor);
    // The overlay is appended to body and covers the panel, so the panel cannot
    // clip it: it copies the corner of the innermost rounded ancestor instead.
    assert.equal(surface.element.style.borderRadius, "12px");
    dom.window.requestAnimationFrame = () => {
      throw Error("An occluded host cannot depend on animation frames");
    };
    let detaches = 0;
    dom.window.customElements.define(
      "test-guest",
      class extends dom.window.HTMLElement {
        disconnectedCallback() {
          detaches++;
        }
      },
    );
    const guest = doc.createElement("test-guest");
    const input = doc.createElement("input");
    input.value = "unsaved page state";
    guest.append(input);
    surface.element.append(guest);
    // SiYuan's split() moves the window subtree; moveTab() appends the panel.
    doc.getElementById("right")!.append(doc.getElementById("left")!);
    doc.getElementById("right")!.append(anchor);
    rect = { left: 200, top: 300, width: 400, height: 200 };
    surface.sync();
    assert.equal(detaches, 0);
    assert.equal(guest.isConnected, true);
    assert.equal(input.value, "unsaved page state");
    assert.equal(surface.element.style.top, "300px");
    assert.equal(surface.element.style.width, "400px");
    // The overlay cannot be clipped by the panel it covers, so it copies the
    // panel's corner: the same shape as the theme, no shape on a square theme.
    // The anchor moved out of the rounded wrapper into a square one.
    assert.equal(surface.element.style.borderRadius, "");
    radii.set(doc.getElementById("right")!, "8px");
    surface.sync();
    assert.equal(surface.element.style.borderRadius, "8px");
    radii.delete(doc.getElementById("right")!);
    surface.sync();
    assert.equal(surface.element.style.borderRadius, "");
    shown = false;
    anchor.classList.add("fn__none");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(surface.element.style.visibility, "hidden");
    assert.equal(surface.element.inert, true);
    shown = true;
    surface.sync();
    assert.equal(surface.element.style.visibility, "");
    anchor.remove();
    surface.sync();
    assert.equal(surface.element.style.visibility, "hidden");
    assert.equal(detaches, 0);
    surface.destroy();
    assert.equal(detaches, 1);
    assert.equal(disconnected, true);
    assert.equal(doc.querySelector(".sb-tab-surface"), null);
  } finally {
    globalThis.MutationObserver = originalMutation;
    globalThis.ResizeObserver = originalResize;
    dom.window.close();
  }
});

test("native tab drags shield the page before entering it, and cancellation/drop/unload release it", async () => {
  const dom = new JSDOM(
    '<body><ul class="layout-tab-bar"><li data-type="tab-header"><span>tab</span></li></ul><a draggable="true">page link</a></body>',
  );
  const doc = dom.window.document;
  const stop = watchTabDrag(doc);
  const event = (type: string) => new dom.window.Event(type, { bubbles: true });
  const active = () => doc.body.classList.contains("sb-tab-dragging");
  doc.querySelector("a")!.dispatchEvent(event("dragstart"));
  assert.equal(active(), false);
  doc.querySelector("span")!.dispatchEvent(event("dragstart"));
  assert.equal(active(), true);
  doc.dispatchEvent(event("drop"));
  // Keep the shield through the host's synchronous drop handler.
  assert.equal(active(), true);
  await Promise.resolve();
  assert.equal(active(), false);
  doc.querySelector("span")!.dispatchEvent(event("dragstart"));
  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(active(), false);
  const external = event("dragenter");
  Object.defineProperty(external, "dataTransfer", {
    value: { types: ["application/siyuan-tab"] },
  });
  doc.dispatchEvent(external);
  assert.equal(active(), true);
  doc.dispatchEvent(event("dragend"));
  await Promise.resolve();
  assert.equal(active(), false);
  doc.querySelector("span")!.dispatchEvent(event("dragstart"));
  stop();
  assert.equal(active(), false);
  doc.querySelector("span")!.dispatchEvent(event("dragstart"));
  assert.equal(active(), false);
  dom.window.close();
});
