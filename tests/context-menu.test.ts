import { test } from "node:test";
import assert from "node:assert/strict";
import { contextMenuPosition } from "../src/context-menu";
import { build } from "esbuild";

test("native webview menu positions use embedder DIPs and only undo host zoom", () => {
  // Native macOS samples: same click at (1200,550) display pixels, DPR 2.
  // Guest zoom 1 and 1.1 both return the same Electron coordinates.
  for (const hostZoom of [1, 1.1, 0.8, 1.5]) {
    const point = contextMenuPosition({ x: 600, y: 275 }, hostZoom);
    assert.equal(point.x * hostZoom, 600);
    assert.equal(point.y * hostZoom, 275);
  }
  // The split-pane offset is already represented in the native point.
  assert.deepEqual(contextMenuPosition({ x: 1100, y: 500 }, 1.25), {
    x: 880,
    y: 400,
  });
});

test("reader coordinates stay in host CSS pixels and edge fitting belongs to SiYuan", () => {
  assert.deepEqual(
    contextMenuPosition({ hostContext: true, x: 1234, y: 789 }, 1.5),
    { x: 1234, y: 789 },
  );
  assert.deepEqual(contextMenuPosition({ x: 1330, y: 840 }, 1), {
    x: 1330,
    y: 840,
  });
  assert.deepEqual(contextMenuPosition({ x: 0, y: 0 }, 1.5), { x: 0, y: 0 });
  assert.deepEqual(contextMenuPosition({}, NaN), { x: 0, y: 0 });
});

test("webpage and reader menus forward the corrected anchor without adding webview bounds", async () => {
  const bundle = await build({
    entryPoints: ["src/view.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["siyuan"],
  });
  let anchor: any;
  const module = { exports: {} as any };
  new Function("module", "exports", "require", bundle.outputFiles[0].text)(
    module,
    module.exports,
    () => ({
      Menu: class {
        addItem() {}
        addSeparator() {}
        open(position: any) {
          anchor = position;
        }
      },
    }),
  );
  const view = {
    plugin: { t: (key: string) => key, adapter: { hostZoom: () => 1.25 } },
    web: {
      getBoundingClientRect: () => {
        throw Error("Must not add the webview offset");
      },
    },
  };
  module.exports.BrowserView.prototype.context.call(view, { x: 1000, y: 500 });
  assert.deepEqual(anchor, { x: 800, y: 400 });
  module.exports.BrowserView.prototype.context.call(view, {
    hostContext: true,
    x: 800,
    y: 400,
  });
  assert.deepEqual(anchor, { x: 800, y: 400 });
});
