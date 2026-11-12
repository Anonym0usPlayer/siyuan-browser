import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("bookmark notes require an explicit marker and safe URL; creation preserves URL and sets document attributes", async () => {
  const bundle = await build({
    entryPoints: ["src/bookmark-note.ts"],
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
  const { bookmarkURL, createBookmarkNote, BOOKMARK_KIND, BOOKMARK_URL } =
    module.exports;
  assert.equal(bookmarkURL(undefined), undefined);
  assert.equal(
    bookmarkURL({ [BOOKMARK_URL]: "https://example.com" }),
    undefined,
  );
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,hello",
    "",
  ]) {
    assert.equal(
      bookmarkURL({ [BOOKMARK_KIND]: "bookmark", [BOOKMARK_URL]: url }),
      undefined,
    );
    await assert.rejects(createBookmarkNote("n", "/", "title", url));
  }
  const url = "https://example.com/?a=1&b=2#fragment";
  assert.equal(
    bookmarkURL({ [BOOKMARK_KIND]: "bookmark", [BOOKMARK_URL]: url }),
    url,
  );
  const original = globalThis.fetch;
  let request: any;
  let attrs: any;
  globalThis.fetch = (async (endpoint: string, init: RequestInit) => {
    if (endpoint === "/api/filetree/createDocWithMd")
      request = JSON.parse(init.body as string);
    else {
      assert.equal(endpoint, "/api/attr/setBlockAttrs");
      attrs = JSON.parse(init.body as string);
    }
    return { ok: true, json: async () => ({ code: 0, data: "doc-id" }) };
  }) as unknown as typeof fetch;
  try {
    assert.equal(
      await createBookmarkNote("n", "/书签/技术/", "Example", url),
      "doc-id",
    );
    assert.equal(request.path, "/书签/技术/Example");
    assert.match(
      request.markdown,
      /<https:\/\/example.com\/\?a=1&b=2#fragment>/,
    );
    assert.equal(attrs.id, "doc-id");
    assert.equal(bookmarkURL(attrs.attrs), url);
    await createBookmarkNote(
      "n",
      "/",
      "With icon",
      url,
      "https://example.com/icon.png",
    );
    assert.equal(attrs.attrs.icon, "https://example.com/icon.png");
  } finally {
    globalThis.fetch = original;
  }
});

test("opening routes only marked foreground documents and ignores duplicate/background events", async () => {
  const bundle = await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["siyuan"],
    loader: { ".css": "empty" },
  });
  const module = { exports: {} as any };
  new Function("module", "exports", "require", bundle.outputFiles[0].text)(
    module,
    module.exports,
    () => ({ Plugin: class {}, showMessage: () => {} }),
  );
  const p = new module.exports.default();
  const tasks: Promise<void>[] = [];
  const opened: string[] = [];
  let closed = 0,
    hidden = false,
    requests = 0;
  p.guard = (fn: () => Promise<void>) => tasks.push(fn());
  p.open = async (url: string) => {
    opened.push(url);
  };
  const protyle = {
    block: { rootID: "doc" },
    model: { parent: { close: () => closed++ } },
    element: { isConnected: true, closest: () => (hidden ? {} : null) },
  };
  const event = { detail: { protyle } };
  let attrs: Record<string, string> = {};
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    requests++;
    return { ok: true, json: async () => ({ code: 0, data: attrs }) };
  }) as unknown as typeof fetch;
  try {
    p.openBookmarkNote(event);
    await Promise.all(tasks);
    assert.equal(opened.length, 0);
    assert.equal(closed, 0);
    attrs = {
      "custom-siyuan-browser-kind": "bookmark",
      "custom-siyuan-browser-url": "https://example.com/",
    };
    hidden = true;
    p.openBookmarkNote(event);
    assert.equal(requests, 1);
    hidden = false;
    p.openBookmarkNote(event);
    p.openBookmarkNote(event);
    await Promise.all(tasks);
    assert.deepEqual(opened, ["https://example.com/"]);
    assert.equal(closed, 1);
    assert.equal(requests, 2);
    p.openBookmarkNote(event);
    protyle.block.rootID = "different";
    await Promise.all(tasks);
    assert.equal(opened.length, 1);
    assert.equal(closed, 1);
    // Reuse is keyed by document identity, not URL, and survives view restoration.
    let created = 0,
      focused = 0;
    const makeTab = () => ({
      headElement: { isConnected: true },
      parent: { switchTab: () => focused++ },
    });
    p.open = async () => {
      created++;
      return makeTab();
    };
    const [first, duplicate] = await Promise.all([
      p.openBookmarkTab("a", "https://example.com/"),
      p.openBookmarkTab("a", "https://example.com/"),
    ]);
    assert.equal(first, duplicate);
    assert.equal(created, 1);
    assert.equal(await p.openBookmarkTab("a", "https://example.com/"), first);
    assert.equal(focused, 1);
    assert.equal(created, 1);
    await p.openBookmarkTab("b", "https://example.com/");
    assert.equal(created, 2);
    first.headElement.isConnected = false;
    await p.openBookmarkTab("a", "https://example.com/");
    assert.equal(created, 3);
    const restored = makeTab();
    p.views.add({
      disposed: false,
      custom: { data: { bookmarkDocId: "restored" }, tab: restored },
    });
    assert.equal(
      await p.openBookmarkTab("restored", "https://example.com/"),
      restored,
    );
    assert.equal(created, 3);
  } finally {
    globalThis.fetch = original;
  }
});
