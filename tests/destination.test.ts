import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { readConfig } from "../src/core";

test("save options migrate old destinations, resolve Sprig, strip notebook prefixes and cancel without persisting", async () => {
  const dom = new JSDOM("<body></body>");
  Object.assign(globalThis, {
    document: dom.window.document,
    Option: dom.window.Option,
  });
  const bundle = await build({
    entryPoints: ["src/destination.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "host",
        setup(b) {
          b.onResolve({ filter: /^siyuan$/ }, () => ({
            path: "host",
            namespace: "stub",
          }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents: `export class Dialog { constructor(o) { this.o=o; this.element=document.createElement('div'); this.element.innerHTML=o.content; document.body.append(this.element); globalThis.lastDialog=this; } destroy() { this.element.remove(); this.o.destroyCallback?.(); } }`,
          }));
        },
      },
    ],
  });
  const module = { exports: {} as any };
  new Function("module", "exports", bundle.outputFiles[0].text)(
    module,
    module.exports,
  );
  const {
    normalizeTags,
    searchDocumentParent,
    resolveParentPath,
    chooseDestination,
  } = module.exports;
  const old = readConfig({ notebook: "n", parentPath: "/已有父文档" });
  assert.equal(old.savePathMode, "search");
  assert.equal(await resolveParentPath(old), "/已有父文档");
  assert.equal(searchDocumentParent("「资源」/网页剪藏"), "/网页剪藏");
  assert.equal(normalizeTags("#A, A，B, "), "A,B");
  const calls: any[] = [];
  globalThis.fetch = async (url: any, init: any) => {
    const body = JSON.parse(init.body);
    calls.push([url, body]);
    const data = String(url).endsWith("lsNotebooks")
      ? { notebooks: [{ id: "n", name: "资源" }] }
      : String(url).endsWith("searchDocs")
        ? [{ box: "n", hPath: "资源/网页剪藏" }]
        : String(url).endsWith("searchAttributeView")
          ? { results: [] }
          : "/剪藏/2026/10";
    return new Response(JSON.stringify({ code: 0, data }));
  };
  assert.equal(
    await resolveParentPath(
      readConfig({
        savePathMode: "template",
        pathTemplate: '/剪藏/{{now | date "2006/01"}}',
      }),
    ),
    "/剪藏/2026/10",
  );
  assert.equal(calls.at(-1)[1].template, '/剪藏/{{now | date "2006/01"}}');
  let persisted = false;
  const p = {
    config: old,
    t: (s: string) => s,
    persist() {
      persisted = true;
    },
  };
  const pending = chooseDestination(p, "Article");
  await new Promise((r) => setTimeout(r, 10));
  (globalThis as any).lastDialog.destroy();
  await assert.rejects(pending, /Cancelled/);
  assert.equal(persisted, false);
  assert.equal(p.config.parentPath, "/已有父文档");
});
