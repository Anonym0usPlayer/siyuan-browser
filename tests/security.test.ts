import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { HOME_GUEST_URL, INTERNAL_URLS, internalGuestURL } from "../src/core";
test("main-process hooks isolate plugin sessions, deny protocols and fully release owned guests", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "siyuan-browser-unit-"));
  const app: any = new EventEmitter();
  app.getPath = () => dir;
  const fixture = { app, sessions: new Map(), guests: new Map() };
  (globalThis as any).__electronFixture = fixture;
  try {
    const file = path.join(dir, "main.cjs");
    await build({
      entryPoints: ["src/main.ts"],
      outfile: file,
      bundle: true,
      platform: "node",
      format: "cjs",
      alias: { electron: path.resolve("tests/electron-mock.ts") },
    });
    const bridge = createRequire(import.meta.url)(file);
    const events: any[] = [];
    const a = bridge.acquire(
      "/workspace/a",
      7,
      "http://127.0.0.1:16838",
      (e: any) => events.push(e),
    );
    const b = bridge.acquire(
      "/workspace/b",
      8,
      "http://127.0.0.1:17838",
      () => {},
    );
    assert.notEqual(a.partition, b.partition);
    assert.deepEqual(
      await bridge.searchSuggestions("missing", "Bing", INTERNAL_URLS.home),
      [],
    );
    assert.match(a.partition, /^persist:siyuan-browser-/);
    const ses: any = fixture.sessions.get(a.partition);
    let cancelled = false;
    ses.fetch = async () =>
      new Response(new Uint8Array(20), {
        headers: { "content-type": "image/png" },
      });
    const icon = await bridge.resource(
      a.partition,
      "https://example.com/favicon.ico",
      20,
    );
    assert.equal(icon.mime, "image/png");
    await assert.rejects(
      () => bridge.resource(a.partition, "https://example.com/favicon.ico", 10),
      /exceeds 10 bytes/,
    );
    ses.fetch = async () => ({
      ok: true,
      headers: new Headers({ "content-length": "20" }),
      body: {
        cancel: async () => {
          cancelled = true;
        },
      },
    });
    await assert.rejects(
      () => bridge.resource(a.partition, "https://example.com/favicon.ico", 10),
      /exceeds 10 bytes/,
    );
    assert.equal(cancelled, true);
    await assert.rejects(
      () =>
        bridge.resource(a.partition, "http://127.0.0.1:16838/favicon.ico", 20),
      /Kernel resources/,
    );
    let permission = true;
    ses.permission(null, "camera", (value: boolean) => (permission = value));
    assert.equal(permission, false);
    assert.equal(ses.checkPermission(), false);
    const request = (url: string, type = "image") => {
      let result: any;
      ses.request(
        { url, resourceType: type, referrer: "" },
        (r: any) => (result = r),
      );
      return result;
    };
    assert.equal(request("https://example.com/image.png").cancel, undefined);
    assert.equal(request("file:///etc/passwd").cancel, true);
    assert.equal(request(HOME_GUEST_URL, "mainFrame").cancel, undefined);
    for (const url of Object.values(INTERNAL_URLS))
      assert.equal(
        request(internalGuestURL(url)!, "mainFrame").cancel,
        undefined,
      );
    assert.equal(request("about:blank#other", "mainFrame").cancel, true);
    assert.equal(
      request("http://127.0.0.1:16838/api/system/version").cancel,
      true,
    );
    assert.equal(request("http://localhost:6806/").cancel, true);
    const guest: any = new EventEmitter();
    guest.id = 15;
    guest.hostWebContents = { id: 7 };
    guest.session = ses;
    guest.setWindowOpenHandler = (fn: any) => (guest.open = fn);
    guest.close = () => {
      guest.emit("destroyed");
      fixture.guests.delete(15);
    };
    fixture.guests.set(15, guest);
    app.emit("web-contents-created", {}, guest);
    const state = (globalThis as any).__siyuanBrowserSessions.get(a.partition);
    state.engine = { match: () => ({ match: true }) };
    const filtered = (id: number) => {
      let result: any;
      ses.request(
        {
          url: "https://example.com/ad.js",
          resourceType: "script",
          webContentsId: id,
        },
        (r: any) => (result = r),
      );
      return result.cancel;
    };
    assert.equal(filtered(15), true);
    bridge.setPageFiltering(a.partition, 15, false);
    assert.equal(filtered(15), undefined);
    assert.equal(filtered(99), true);
    assert.throws(
      () => bridge.setPageFiltering(b.partition, 15, false),
      /Unknown/,
    );
    bridge.setPageFiltering(a.partition, 15, true);
    assert.equal(filtered(15), true);
    state.engine = null;
    let homeDenied = false,
      unsafeDenied = false;
    guest.emit(
      "will-navigate",
      {
        preventDefault: () => {
          homeDenied = true;
        },
      },
      HOME_GUEST_URL,
    );
    guest.emit(
      "will-navigate",
      {
        preventDefault: () => {
          unsafeDenied = true;
        },
      },
      "siyuan-browser://home",
    );
    assert.equal(homeDenied, false);
    assert.equal(unsafeDenied, true);
    assert.deepEqual(
      guest.open({
        url: "https://example.com/popup",
        disposition: "foreground-tab",
      }),
      { action: "deny" },
    );
    assert.equal(events[0].url, "https://example.com/popup");
    guest.open({ url: "file:///tmp/test", disposition: "foreground-tab" });
    assert.equal(events.length, 1);
    const archive = await bridge.archive(
      a.partition,
      Buffer.from("MIME-Version: 1.0").toString("base64"),
    );
    const archives: any = fixture.sessions.get(archive.partition);
    let allowed: any, blocked: any;
    archives.request({ url: archive.url }, (r: any) => (allowed = r));
    archives.request(
      { url: "https://example.com/" },
      (r: any) => (blocked = r),
    );
    assert.equal(allowed.cancel, false);
    assert.equal(blocked.cancel, true);
    assert.equal(
      await readFile(new URL(archive.url), "utf8"),
      "MIME-Version: 1.0",
    );
    await bridge.release(a.partition, 7);
    assert.equal(ses.request, null);
    assert.equal(ses.permission, null);
    assert.equal(fixture.guests.size, 0);
    assert.deepEqual(bridge.status(a.partition).guests, []);
    await bridge.release(b.partition, 8);
    assert.equal(app.listenerCount("web-contents-created"), 0);
  } finally {
    delete (globalThis as any).__electronFixture;
    delete (globalThis as any).__siyuanBrowserSessions;
    await rm(dir, { recursive: true, force: true });
  }
});
