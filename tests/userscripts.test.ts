import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import {
  parseScript,
  matchPattern,
  matches,
} from "../src/userscripts/metadata";
import { UserScriptStore } from "../src/userscripts/store";
import { UserScriptService } from "../src/userscripts/service";
import {
  publicAddress,
  fetchDependency,
} from "../src/userscripts/dependencies";

const source = (extra = "", namespace = "test") => `// ==UserScript==
// @name Test script
// @namespace ${namespace}
// @version 1
// @match https://*.example.com/*
// @exclude-match https://example.com/private*
// @grant GM.getValue
// @grant GM.setValue
// @grant GM.deleteValue
// @grant GM.listValues
// @grant GM.openInTab
// @grant GM_registerMenuCommand
// @noframes
${extra}
// ==/UserScript==
document.body.dataset.script = 'ran';`;

test("userscript metadata rejects unsupported behavior instead of silently enabling it", () => {
  assert.deepEqual(parseScript(source()).problems, []);
  for (const extra of [
    "// @run-at document-start",
    "// @grant GM_xmlhttpRequest",
    "// @include *",
    "// @inject-into page",
    "// @require http://example.com/a.js",
    "// @match https://example.com:80/*",
  ])
    assert.ok(parseScript(source(extra)).problems.length, extra);
  assert.ok(parseScript(source().replace("// @noframes", "")).problems.length);
  assert.ok(parseScript(source("// @grant none")).problems.length);
  assert.throws(() => parseScript("alert(1)\n" + source()), /leading/);
});
test("matching honors domain boundaries, scheme, query, exclusions and blocks non-web protocols", () => {
  const meta = parseScript(source());
  for (const url of [
    "https://example.com/",
    "https://a.example.com/a?q=1",
    "https://example.com:8443/a",
  ])
    assert.equal(matches(meta, url), true, url);
  for (const url of [
    "https://example.com.evil.test/",
    "https://badexample.com/",
    "http://example.com/",
    "https://example.com/private?a=1",
    "file:///example.com/",
    "https://user:pass@example.com/",
  ])
    assert.equal(matches(meta, url), false, url);
  assert.equal(
    matchPattern("*://example.com/a?x=*")("http://example.com/a?x=1#fragment"),
    true,
  );
  assert.equal(
    matchPattern("https://example.com/a.b*")("https://example.com/axb"),
    false,
  );
});
test("dependency loader rejects local addresses and unsafe URL forms before any connection", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.1.1",
    "192.168.0.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("1.1.1.1"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  for (const url of [
    "https://127.0.0.1/a.js",
    "http://example.com/a.js",
    "https://example.com:6806/a",
    "https://u:p@example.com/a",
  ])
    await assert.rejects(fetchDependency(url));
});
async function fixture(
  fn: (store: UserScriptStore, file: string) => Promise<void>,
) {
  const dir = await mkdtemp(path.join(tmpdir(), "siyuan-userscript-test-"));
  const file = path.join(dir, "userscripts.json");
  try {
    await fn(new UserScriptStore(file), file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("durable storage isolates identities, serializes parallel writes and preserves data on disabled updates", async () =>
  fixture(async (store, file) => {
    const a = await store.install(source(), []),
      b = await store.install(source("", "other"), []);
    assert.notEqual(a, b);
    assert.equal((await store.list())[0].enabled, false);
    await store.change(a, "enable");
    const rev = (await store.list()).find((s) => s.id === a)!.revision;
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        store.value(a, rev, "setValue", "k" + i, i),
      ),
    );
    await store.value(a, rev, "setValue", "__proto__", { safe: true });
    assert.equal(
      ((await store.value(a, rev, "listValues")) as string[]).length,
      13,
    );
    (globalThis as any).__siyuanUserScriptStoreState.delete(file);
    const reopened = new UserScriptStore(file);
    assert.equal(await reopened.value(a, rev, "getValue", "k11"), 11);
    assert.deepEqual(await reopened.value(a, rev, "getValue", "__proto__"), {
      safe: true,
    });
    assert.deepEqual((await store.list()).find((s) => s.id === b)!.values, {});
    await store.install(source().replace("@version 1", "@version 2"), []);
    const updated = (await store.list()).find((s) => s.id === a)!;
    assert.equal(updated.enabled, false);
    assert.equal(updated.values.k11, 11);
    await assert.rejects(
      store.value(a, rev, "getValue", "k11"),
      /disabled or updated/,
    );
    await store.change(a, "remove");
    (globalThis as any).__siyuanUserScriptStoreState.delete(file);
    assert.equal((await new UserScriptStore(file).list()).length, 1);
  }));
test("storage quota, corrupted stores and queued stale callbacks fail without destroying prior data", async () =>
  fixture(async (store, file) => {
    const id = await store.install(source(), []);
    await store.change(id, "enable");
    const rev = (await store.list())[0].revision;
    await store.value(id, rev, "setValue", "ok", 1);
    const before = await readFile(file, "utf8");
    await assert.rejects(
      store.value(id, rev, "setValue", "large", "中".repeat(100000)),
      /256 KiB/,
    );
    await assert.rejects(
      store.value(id, rev, "setValue", "stale", 2, () => {
        throw Error("navigated");
      }),
      /navigated/,
    );
    assert.equal(await readFile(file, "utf8"), before);
    await writeFile(file, "{broken");
    const corruptFile = file + ".corrupt";
    await writeFile(corruptFile, "{broken");
    await assert.rejects(
      new UserScriptStore(corruptFile).list(),
      /Cannot read/,
    );
    assert.equal(await readFile(file, "utf8"), "{broken");
    await writeFile(corruptFile, "null");
    await assert.rejects(
      new UserScriptStore(corruptFile).list(),
      /Invalid userscript store/,
    );
    assert.equal(await readFile(corruptFile, "utf8"), "null");
  }));
function guest(url = "https://example.com/page") {
  const w: any = new EventEmitter();
  w.mainFrame = { url };
  w.getURL = () => w.mainFrame.url;
  w.messages = [];
  w.send = (...args: any[]) => w.messages.push(args);
  return w;
}
test("GM RPC rejects host/iframe/cross-guest calls, forged tokens, revoked permissions and navigation races", async () =>
  fixture(async (store) => {
    const w = guest(),
      other = guest();
    const service = new UserScriptService(
      store,
      (x) => x === w || x === other,
      () => {},
    );
    service.register(w);
    service.register(other);
    const id = await service.manage("install", { source: source() });
    await service.manage("enable", { id });
    const event = { sender: w, senderFrame: w.mainFrame };
    const [plan] = (await service.rpc(event, { op: "plans" })) as any[];
    assert.equal(plan.meta.name, "Test script");
    assert.deepEqual(await service.rpc(event, { op: "plans" }), []);
    const request = { token: plan.token, op: "setValue", key: "x", value: 1 };
    await assert.rejects(
      service.rpc({ sender: w, senderFrame: { url: w.getURL() } }, request),
      /Untrusted/,
    );
    await assert.rejects(
      service.rpc({ sender: other, senderFrame: other.mainFrame }, request),
      /expired/,
    );
    await assert.rejects(
      service.rpc(event, { ...request, token: "guess" }),
      /expired/,
    );
    await service.rpc(event, request);
    await service.manage("disable", { id });
    await assert.rejects(service.rpc(event, request), /expired/);
    assert.equal(service.commands(w).length, 0);
    await service.manage("enable", { id });
    w.emit("did-start-navigation", {}, w.getURL(), false, true);
    const [newPlan] = (await service.rpc(event, { op: "plans" })) as any[];
    w.emit("did-start-navigation", {}, w.getURL(), false, true);
    await assert.rejects(
      service.rpc(event, { ...request, token: newPlan.token }),
      /expired/,
    );
    service.dispose();
    await assert.rejects(service.rpc(event, { op: "plans" }), /Untrusted/);
  }));
test("menus and tabs obey grants, dependency failures never partially install", async () =>
  fixture(async (store) => {
    const w = guest();
    const opened: any[] = [];
    const service = new UserScriptService(
      store,
      (x) => x === w,
      (...args) => opened.push(args),
    );
    service.register(w);
    const id = await service.manage("install", { source: source() });
    await service.manage("enable", { id });
    const event = { sender: w, senderFrame: w.mainFrame };
    const [plan] = (await service.rpc(event, { op: "plans" })) as any[];
    await service.rpc(event, {
      token: plan.token,
      op: "registerMenuCommand",
      id: 1,
      label: "Run",
    });
    assert.equal(service.commands(w)[0].label, "Test script · Run");
    service.command(w, plan.token, 1);
    assert.equal(w.messages.at(-1)[1].id, 1);
    await service.rpc(event, {
      token: plan.token,
      op: "openInTab",
      url: "https://example.org/",
      background: true,
    });
    assert.equal(opened[0][1], "https://example.org/");
    await assert.rejects(
      service.rpc(event, {
        token: plan.token,
        op: "openInTab",
        url: "file:///etc/passwd",
      }),
    );
    await assert.rejects(
      service.manage("install", {
        source: source("// @require https://127.0.0.1/test.js"),
      }),
    );
    assert.equal((await store.list())[0].enabled, true);
    const minimal = source()
      .replace(/\/\/ @grant .*\n/g, "")
      .replace("// @noframes", "// @grant none\n// @noframes");
    await service.manage("install", { source: minimal });
    await service.manage("enable", { id });
    w.emit("did-start-navigation", {}, w.getURL(), false, true);
    const [none] = (await service.rpc(event, { op: "plans" })) as any[];
    await assert.rejects(
      service.rpc(event, {
        token: none.token,
        op: "setValue",
        key: "x",
        value: 1,
      }),
      /Undeclared/,
    );
  }));
