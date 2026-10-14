import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
});
test("partial saves retry same document, retain successful resources and snapshot, reject user edits", async () => {
  const { runSave } = await import("../src/archive");
  let content = "",
    creates = 0,
    uploads = 0,
    snapshots = 0,
    resourceCalls = 0,
    fail = true;
  globalThis.fetch = async (input: any, init: any) => {
    const url = String(input);
    if (url.endsWith("/asset/upload")) {
      uploads++;
      return new Response(
        JSON.stringify({
          code: 0,
          data: { succMap: { file: "assets/saved-" + uploads + ".bin" } },
        }),
      );
    }
    const body = JSON.parse(init.body);
    if (url.endsWith("/createDocWithMd")) {
      creates++;
      content = body.markdown;
      return new Response(JSON.stringify({ code: 0, data: "doc-id" }));
    }
    if (url.endsWith("/updateBlock")) content = body.data;
    return new Response(
      JSON.stringify({ code: 0, data: { kramdown: content } }),
    );
  };
  const bridge = {
    resource: async () => {
      resourceCalls++;
      if (fail) throw Error("offline");
      return { base64: "aGVsbG8=", mime: "image/png" };
    },
    snapshot: async () => {
      snapshots++;
      return "aGVsbG8=";
    },
  };
  const job: any = {
    id: "abcdef01-abcd-1234-abcd-abcdef012345",
    created: 0,
    article: {
      title: "Title",
      url: "https://example.com",
      html: '<p>正文</p><img src="https://example.com/img.png">',
      fallback: false,
    },
    notebook: "notebook",
    parentPath: "/",
    resources: {},
    body: "pending",
    cancelled: false,
  };
  await runSave(job, bridge, "p", 1, async () => {});
  assert.equal(job.body, "saved");
  assert.equal(creates, 1);
  assert.ok(job.resources["https://example.com/img.png"].error);
  assert.ok(job.snapshot);
  fail = false;
  await runSave(job, bridge, "p", 1, async () => {});
  assert.equal(creates, 1);
  assert.equal(snapshots, 1);
  assert.equal(resourceCalls, 2);
  assert.equal(uploads, 2);
  assert.ok(job.resources["https://example.com/img.png"].path);
  content += "\nUser edit";
  await runSave(job, bridge, "p", 1, async () => {});
  assert.equal(job.body, "failed");
  assert.match(content, /User edit/);
  assert.match(job.error, /文档已被编辑/);
});
test("cancelled jobs do not perform network writes", async () => {
  const { runSave } = await import("../src/archive");
  await assert.rejects(
    () => runSave({ cancelled: true } as any, {}, "p", 1, async () => {}),
    /Cancelled/,
  );
});

test("database and tags participate in saving; failed database insertion retries the same document", async () => {
  const { runSave } = await import("../src/archive");
  let content = "",
    creates = 0,
    additions = 0;
  const requests: any[] = [];
  globalThis.fetch = async (input: any, init: any) => {
    const url = String(input),
      body = JSON.parse(init.body);
    requests.push([url, body]);
    if (url.endsWith("createDocWithMd")) {
      creates++;
      content = body.markdown;
    }
    if (url.endsWith("updateBlock")) content = body.data;
    if (url.endsWith("addAttributeViewBlocks") && ++additions === 1)
      return new Response(
        JSON.stringify({ code: -1, msg: "Database unavailable" }),
      );
    const data = url.endsWith("query/sql")
      ? []
      : url.endsWith("createDocWithMd")
        ? "doc-id"
        : { kramdown: content };
    return new Response(JSON.stringify({ code: 0, data }));
  };
  const job: any = {
    id: "abcdef01-abcd-1234-abcd-abcdef012345",
    created: 0,
    article: {
      title: "Article",
      url: "https://example.com",
      html: "<p>Text</p>",
    },
    notebook: "n",
    parentPath: "/剪藏/2026/10",
    databaseID: "db",
    tags: "A,B",
    snapshot: "assets/a.mhtml",
    resources: {},
    body: "pending",
    cancelled: false,
  };
  await runSave(job, {}, "p", 1, async () => {});
  assert.equal(job.body, "failed");
  assert.equal(job.docId, "doc-id");
  const create = requests.find(([url]) => url.endsWith("createDocWithMd"))[1];
  assert.match(create.path, /^\/剪藏\/2026\/10\//);
  assert.equal(create.tags, "A,B");
  await runSave(job, {}, "p", 1, async () => {});
  assert.equal(job.body, "saved");
  assert.equal(creates, 1);
  assert.equal(additions, 2);
});

test("database item template uses the native template endpoint and never repeats uncertain creation", async () => {
  const { runSave } = await import("../src/archive");
  let attempts = 0;
  globalThis.fetch = async (input: any, init: any) => {
    const url = String(input),
      body = JSON.parse(init.body);
    if (url.endsWith("createAttributeViewItemWithMarkdown")) {
      attempts++;
      assert.equal(body.templateID, "tpl");
      assert.equal(body.avID, "db");
      throw Error("Connection lost after request");
    }
    return new Response(JSON.stringify({ code: 0, data: [] }));
  };
  const job: any = {
    id: "abcdef01-abcd-1234-abcd-abcdef012345",
    created: 0,
    article: {
      title: "Article",
      url: "https://example.com",
      html: "<p>Text</p>",
    },
    notebook: "",
    parentPath: "/",
    databaseID: "db",
    databaseTemplateID: "tpl",
    snapshot: "assets/a.mhtml",
    resources: {},
    body: "pending",
    cancelled: false,
  };
  await runSave(job, {}, "p", 1, async () => {});
  await runSave(job, {}, "p", 1, async () => {});
  assert.equal(attempts, 1);
  assert.match(job.error, /结果不确定/);
});
