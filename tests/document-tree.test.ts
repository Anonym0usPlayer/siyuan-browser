import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("destination tree loads branches lazily, selects roots and nested documents, and retries failures", async () => {
  const dom = new JSDOM("<body></body>");
  const originalDocument = globalThis.document,
    originalFetch = globalThis.fetch;
  globalThis.document = dom.window.document;
  const calls: any[] = [];
  let fail = true;
  globalThis.fetch = (async (_: unknown, init: RequestInit) => {
    const data = JSON.parse(init.body as string);
    calls.push(data);
    if (data.path === "/parent.sy" && fail) {
      fail = false;
      throw Error("Temporary failure");
    }
    return new Response(
      JSON.stringify({
        code: 0,
        data: {
          files:
            data.path === "/"
              ? [
                  {
                    id: "parent",
                    name: "Parent",
                    path: "/parent.sy",
                    subFileCount: 1,
                  },
                ]
              : [
                  {
                    id: "child",
                    name: "Child",
                    path: "/parent/child.sy",
                    subFileCount: 0,
                  },
                ],
        },
      }),
    );
  }) as typeof fetch;
  try {
    const bundle = await build({
      entryPoints: ["src/document-tree.ts"],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      external: ["siyuan"],
    });
    const module = { exports: {} as any };
    new Function("module", "exports", "require", bundle.outputFiles[0].text)(
      module,
      module.exports,
      () => ({}),
    );
    let selection: any;
    const root = module.exports.documentTree(
      [
        { id: "n", name: "Notebook" },
        { id: "closed", name: "Hidden", closed: true },
      ],
      "n",
      (v: any) => (selection = v),
      (k: string) => k,
    );
    document.body.append(root);
    const tick = () => new Promise((r) => setTimeout(r, 0));
    await tick();
    assert.equal(selection.notebook, "n");
    assert.equal(selection.id, undefined);
    assert.equal(calls.length, 1);
    assert.equal(root.textContent.includes("Hidden"), false);
    root.querySelectorAll(".sb-tree-label")[1].click();
    assert.equal(selection.id, "parent");
    assert.equal(calls.length, 1);
    root.querySelectorAll(".sb-tree-toggle")[1].click();
    await tick();
    assert.match(root.textContent, /Temporary failure/);
    root.querySelectorAll(".sb-tree-toggle")[1].click();
    root.querySelectorAll(".sb-tree-toggle")[1].click();
    await tick();
    root.querySelectorAll(".sb-tree-label")[2].click();
    assert.equal(selection.id, "child");
    assert.equal(selection.label, "Notebook/Parent/Child");
    assert.equal(root.querySelectorAll('[aria-selected="true"]').length, 1);
    root.querySelectorAll(".sb-tree-label")[0].click();
    assert.equal(selection.id, undefined);
    const restored = module.exports.documentTree(
      [{ id: "n", name: "Notebook" }],
      "n",
      (v: any) => (selection = v),
      (k: string) => k,
      "/parent/child.sy",
    );
    document.body.append(restored);
    await tick();
    await tick();
    assert.equal(selection.id, "child");
    assert.equal(
      restored
        .querySelector('[aria-selected="true"]')
        .textContent.includes("Child"),
      true,
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
