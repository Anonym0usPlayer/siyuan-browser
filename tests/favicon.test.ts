import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { readConfig, recordVisit } from "../src/core";
import { FaviconCache, FAVICON_BYTES, entryFaviconURL } from "../src/favicon";

const png = { mime: "image/png; charset=binary", base64: "aWNvbg==" };

test("favicon addresses survive persistence and repeat visits; old rows reuse site icons or the default path", () => {
  const icon = "https://cdn.example/site.png";
  const config = readConfig({
    history: [
      {
        url: "https://site.example/page",
        title: "Site",
        time: 1,
        visits: 3,
        favicon: icon,
      },
    ],
    bookmarks: [
      {
        url: "https://site.example/old",
        title: "Old",
        time: 2,
        favicon: "javascript:alert(1)",
      },
    ],
    recentlyClosed: [
      {
        url: "https://site.example/closed",
        title: "Closed",
        time: 3,
        id: "closed",
        favicon: icon,
      },
    ],
  });
  assert.equal(config.bookmarks[0].favicon, undefined);
  assert.equal(config.recentlyClosed[0].favicon, icon);
  assert.equal(entryFaviconURL(config, config.bookmarks[0]), icon);
  assert.equal(
    entryFaviconURL(config, {
      url: "https://other.example/private?q=search",
      title: "",
      time: 1,
    }),
    "https://other.example/favicon.ico",
  );
  assert.equal(
    entryFaviconURL(config, {
      url: "https://site.example/different",
      title: "",
      time: 1,
      favicon: "https://cdn.example/app.png",
    }),
    "https://cdn.example/app.png",
  );
  config.history = recordVisit(config.history, {
    url: "https://site.example/page",
    title: "New title",
    time: 4,
  });
  assert.equal(config.history[0].favicon, icon);
  assert.equal(config.history[0].visits, 4);
  assert.deepEqual(readConfig(JSON.parse(JSON.stringify(config))), config);
});

test("favicon cache deduplicates and limits requests, rejects non-images and keeps failures quiet", async () => {
  const requests: string[] = [];
  const pending: ((value: typeof png) => void)[] = [];
  const cache = new FaviconCache((url) => {
    requests.push(url);
    return new Promise((resolve) => pending.push(resolve));
  });
  const first = cache.get("https://site.example/favicon.ico");
  assert.equal(cache.get("https://site.example/favicon.ico"), first);
  const others = Array.from({ length: 7 }, (_, i) =>
    cache.get(`https://site${i}.example/favicon.ico`),
  );
  assert.equal(requests.length, 6);
  for (const resolve of pending.slice()) resolve(png);
  await first;
  assert.equal(requests.length, 8);
  for (const resolve of pending.slice(6)) resolve(png);
  assert.equal((await Promise.all(others)).length, 7);
  assert.equal(
    await cache.get("https://site.example/favicon.ico"),
    "data:image/png;base64,aWNvbg==",
  );
  assert.equal(requests.length, 8);
  assert.equal(await cache.get("file:///tmp/icon.png"), undefined);
  cache.dispose();
  assert.equal(await cache.get("https://new.example/favicon.ico"), undefined);
  for (const response of [
    { mime: "text/html", base64: "aWNvbg==" },
    { mime: "image/png", base64: "A".repeat((FAVICON_BYTES * 4) / 3 + 1) },
    { mime: "image/png", base64: "<script>" },
  ]) {
    const invalid = new FaviconCache(async () => response);
    assert.equal(
      await invalid.get("https://bad.example/favicon.ico"),
      undefined,
    );
  }
  let failures = 0;
  const missing = new FaviconCache(async () => {
    failures++;
    throw Error("HTTP 404");
  });
  assert.equal(
    await missing.get("https://missing.example/favicon.ico"),
    undefined,
  );
  assert.equal(
    await missing.get("https://missing.example/favicon.ico"),
    undefined,
  );
  assert.equal(failures, 1);
});

test("shared homepage and library rows display icons after decoding and retain initials on errors", async () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  Object.assign(globalThis, { document: dom.window.document });
  const bundle = await build({
    entryPoints: ["src/entries.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "siyuan",
        setup(builder) {
          builder.onResolve({ filter: /^siyuan$/ }, () => ({
            path: "siyuan",
            namespace: "stub",
          }));
          builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents: "export class Dialog {}",
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
  const { entryRow } = module.exports;
  const config = readConfig({
    history: [
      { url: "https://site.example/", title: '<img onerror="bad">', time: 1 },
    ],
  });
  let requests = 0;
  const p = {
    config,
    t: (key: string) => key,
    favicons: new FaviconCache(async () => {
      requests++;
      return png;
    }),
  };
  try {
    for (const kind of [
      "bookmarks",
      "mostVisited",
      "recentlyClosed",
      "history",
    ])
      document.body.append(entryRow(p, config.history[0], kind, () => {}));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 1);
    const badges = [...document.querySelectorAll(".sb-home-site")];
    assert.equal(badges.length, 4);
    for (const badge of badges) {
      const image = badge.querySelector("img")!;
      const fallback = badge.querySelector<HTMLElement>(
        ".sb-home-site-letter",
      )!;
      assert.equal(image.src, "data:image/png;base64,aWNvbg==");
      assert.equal(fallback.textContent, "S");
      image.dispatchEvent(new dom.window.Event("load"));
      assert.equal(fallback.hidden, true);
      image.dispatchEvent(new dom.window.Event("error"));
      assert.equal(fallback.hidden, false);
      assert.equal(badge.querySelector("img"), null);
    }
    assert.equal(document.querySelector(".sb-home-entry-title img"), null);
    const hidden = document.createElement("section");
    hidden.hidden = true;
    hidden.append(
      entryRow(
        p,
        { url: "https://hidden.example/", title: "Hidden", time: 1 },
        "history",
        () => {},
      ),
    );
    document.body.append(hidden);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 1);
  } finally {
    p.favicons.dispose();
    dom.window.close();
  }
});
