import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createContext, runInContext } from "node:vm";

test("preload targets separate worlds, exposes only declared GM methods and revokes callbacks", async () => {
  const bundle = await build({
    entryPoints: ["src/userscripts/preload.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  });
  const requests: any[] = [],
    targets: number[] = [],
    exposed: number[] = [];
  const worlds = new Map<number, any>();
  const document: any = {
    readyState: "complete",
    body: { dataset: {} },
    createElement: () => ({}),
    head: {
      appendChild: (s: any) => {
        document.style = s.textContent;
      },
    },
  };
  let listener: any;
  const plans = [
    {
      token: "a",
      source:
        "await GM.setValue('answer', 42); GM_addStyle('body{color:red}'); GM_registerMenuCommand('Test',()=>{ document.body.dataset.menu='yes'; });",
      meta: {
        name: "A",
        grants: ["GM.setValue", "GM_addStyle", "GM_registerMenuCommand"],
        runAt: "document-end",
      },
      dependencies: [],
    },
    {
      token: "b",
      source:
        "document.body.dataset.other=typeof GM; document.body.dataset.dependency=helper;",
      meta: { name: "B", grants: ["GM_info"], runAt: "document-end" },
      dependencies: ["const helper='dependency ran';"],
    },
    {
      token: "c",
      source: "document.body.dataset.page=typeof __siyuanUserScript;",
      meta: { name: "C", grants: ["none"], runAt: "document-end" },
      dependencies: [],
    },
  ];
  function world(id: number) {
    if (!worlds.has(id)) worlds.set(id, createContext({ document }));
    return worlds.get(id);
  }
  const electron = {
    ipcRenderer: {
      on: (_: string, fn: any) => {
        listener = fn;
      },
      invoke: async (_: string, request: any) => {
        requests.push(request);
        return request.op === "plans" ? plans : undefined;
      },
    },
    contextBridge: {
      exposeInIsolatedWorld: (id: number, key: string, api: any) => {
        exposed.push(id);
        world(id)[key] = api;
      },
    },
    webFrame: {
      executeJavaScriptInIsolatedWorld: (id: number, scripts: any[]) => {
        targets.push(id);
        return Promise.resolve(runInContext(scripts[0].code, world(id)));
      },
    },
  };
  const module = { exports: {} as any };
  const window: any = {};
  window.top = window;
  const context = createContext({
    module,
    exports: module.exports,
    require: () => electron,
    window,
    document,
    location: { protocol: "https:" },
    console,
    setTimeout,
  });
  runInContext(bundle.outputFiles[0].text, context);
  module.exports.installUserScripts();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  assert.deepEqual(targets, [1000, 1001, 0]);
  assert.deepEqual(exposed, [1000, 1001]);
  assert.equal(document.body.dataset.other, "undefined");
  assert.equal(document.body.dataset.page, "undefined");
  assert.equal(document.body.dataset.dependency, "dependency ran");
  assert.equal(document.style, "body{color:red}");
  assert.deepEqual(Object.keys(world(1000).__siyuanUserScript.GM), [
    "setValue",
  ]);
  assert.ok(
    requests.some(
      (r) => r.token === "a" && r.op === "setValue" && r.value === 42,
    ),
  );
  listener({}, { token: "a", id: 1 });
  await new Promise(setImmediate);
  assert.equal(document.body.dataset.menu, "yes");
  listener({}, { revoke: "a" });
  await assert.rejects(
    world(1000).__siyuanUserScript.GM.setValue("late", 1),
    /disabled/,
  );
});
