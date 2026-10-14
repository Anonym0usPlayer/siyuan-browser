import { api, upload, bytes } from "./api";
import { Article, markdown } from "./content";
import { safeTitle, httpURL } from "./core";
export interface SaveJob {
  id: string;
  created: number;
  article: Article;
  docId?: string;
  targetId?: string;
  notebook: string;
  parentPath: string;
  databaseID?: string;
  databaseBlockID?: string;
  databaseViewID?: string;
  databaseTemplateID?: string;
  tags?: string;
  databaseAdded?: boolean;
  templateAttempted?: boolean;
  resources: Record<string, { path?: string; error?: string }>;
  snapshot?: string;
  snapshotError?: string;
  body: "pending" | "saved" | "failed";
  error?: string;
  cancelled: boolean;
  revision?: string;
}
export async function runSave(
  job: SaveJob,
  bridge: any,
  partition: string,
  guestId: number,
  changed: () => Promise<void>,
) {
  const check = () => {
    if (job.cancelled) throw Error("Cancelled");
  };
  check();
  const doc = new DOMParser().parseFromString(job.article.html, "text/html");
  const elements = [
    ...doc.querySelectorAll(
      "img[src],audio[src],video[src],source[src],video[poster],a[download][href]",
    ),
  ];
  const references = elements.flatMap((el) =>
    ["src", "poster", "href"]
      .filter(
        (attr) =>
          el.hasAttribute(attr) &&
          (attr !== "href" || el.hasAttribute("download")),
      )
      .map((attr) => ({ el, attr, url: el.getAttribute(attr)! })),
  );
  for (const { el, attr, url } of references) {
    check();
    let r = job.resources[url] || (job.resources[url] = {});
    if (!r.path) {
      try {
        let data: { base64: string; mime: string };
        if (url.startsWith("data:")) {
          const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(url);
          if (!match || match[2].length > 44 * 1024 * 1024)
            throw Error("Unsupported or oversized data resource");
          data = { mime: match[1], base64: match[2] };
        } else if (httpURL(url)) data = await bridge.resource(partition, url);
        else
          throw Error(
            "This resource cannot be downloaded for offline use (blob/stream or unsupported protocol)",
          );
        check();
        const ext =
          (
            {
              "image/png": ".png",
              "image/jpeg": ".jpg",
              "image/gif": ".gif",
              "image/webp": ".webp",
              "image/svg+xml": ".svg",
              "audio/mpeg": ".mp3",
              "video/mp4": ".mp4",
            } as Record<string, string>
          )[data.mime.split(";")[0]] || ".bin";
        r.path = await upload(
          "web-" + job.id + "-" + Object.keys(job.resources).indexOf(url) + ext,
          bytes(data.base64),
          data.mime,
        );
        delete r.error;
      } catch (e) {
        r.error = String(e);
      }
    }
    if (r.path) el.setAttribute(attr, r.path);
    else if (attr !== "href") el.removeAttribute(attr);
    await changed();
  }
  check();
  if (!job.snapshot) {
    try {
      const data = await bridge.snapshot(partition, guestId, job.article.url);
      check();
      job.snapshot = await upload(
        "web-" + job.id + ".mhtml",
        bytes(data),
        "multipart/related",
      );
      delete job.snapshotError;
    } catch (e) {
      job.snapshotError = String(e);
    }
    await changed();
  }
  check();
  const failed = Object.entries(job.resources).filter(([, r]) => r.error);
  const source = job.article.url.replace(/[<>\n\r]/g, "");
  const md =
    "# " +
    safeTitle(job.article.title) +
    "\n\n" +
    markdown(doc.body.innerHTML, job.article.url) +
    "\n\n---\n\n来源：<" +
    source +
    ">\n\n采集时间：" +
    new Date(job.created).toISOString() +
    "\n\n" +
    (job.snapshot
      ? "[查看离线归档](" + job.snapshot + ")"
      : "完整网页归档失败：" + job.snapshotError) +
    "\n\n" +
    (job.article.fallback ? "正文提取失败，已使用净化页面内容。\n\n" : "") +
    "离线资源：" +
    (Object.keys(job.resources).length - failed.length) +
    " / " +
    Object.keys(job.resources).length +
    "。归档仅包含当前已加载且可获取的内容，不保证流媒体、未加载内容或服务器交互离线可用。" +
    (failed.length
      ? "\n\n失败资源：\n" +
        failed
          .map(
            ([url, r]) => "- <" + url.replace(/[<>\n\r]/g, "") + "> " + r.error,
          )
          .join("\n")
      : "");
  try {
    if (!job.docId) {
      const title =
        safeTitle(job.article.title) +
        " " +
        new Date(job.created).toISOString().replace(/[:.]/g, "-") +
        " " +
        job.id.slice(0, 6);
      if (!job.targetId) {
        job.targetId =
          new Date(job.created).toISOString().replace(/\D/g, "").slice(0, 14) +
          "-" +
          job.id.replace(/-/g, "").slice(0, 7);
        await changed();
      }
      if (!/^\d{14}-[a-z0-9]{7}$/.test(job.targetId))
        throw Error("Invalid target ID");
      const existing = await api<any[]>("query/sql", {
        stmt: "SELECT id FROM blocks WHERE id='" + job.targetId + "' LIMIT 1",
      });
      if (existing.length) {
        job.docId = job.targetId;
        await changed();
        throw Error(
          "Recovered an existing document after an uncertain save. It has been preserved; open it to inspect before starting a new save.",
        );
      }
      if (job.databaseTemplateID) {
        if (job.templateAttempted)
          throw Error(
            "数据库模板保存结果不确定，请先检查数据库，避免重复创建。",
          );
        job.templateAttempted = true;
        await changed();
        const result = await api<{ blockID: string }>(
          "av/createAttributeViewItemWithMarkdown",
          {
            avID: job.databaseID,
            blockID: job.databaseBlockID,
            viewID: job.databaseViewID,
            templateID: job.databaseTemplateID,
            title,
            markdown: md,
            tags: job.tags || "",
            withMath: true,
            clippingHref: job.article.url,
          },
        );
        if (!result.blockID) throw Error("数据库模板未返回文档 ID");
        job.docId = result.blockID;
        job.databaseAdded = true;
      } else
        job.docId = await api<string>("filetree/createDocWithMd", {
          id: job.targetId,
          notebook: job.notebook,
          path: job.parentPath.replace(/\/$/, "") + "/" + title,
          markdown: md,
          tags: job.tags || "",
        });
      await changed();
    } else {
      if (job.databaseTemplateID)
        throw Error(
          "数据库模板文档已保存。为保留模板内容，请新建保存任务重试资源。",
        );
      const current = await api<{ kramdown: string }>(
        "block/getBlockKramdown",
        { id: job.docId },
      );
      if (!job.revision || current.kramdown !== job.revision)
        throw Error(
          "文档已被编辑，已停止重试以保留用户内容。请重新保存为新文档。",
        );
      await api("block/updateBlock", {
        id: job.docId,
        dataType: "markdown",
        data: md,
      });
    }
    const saved = await api<{ kramdown: string }>("block/getBlockKramdown", {
      id: job.docId,
    });
    if (!saved.kramdown.includes(source))
      throw Error("Read-back verification failed");
    job.revision = saved.kramdown;
    if (job.databaseID && !job.databaseAdded) {
      await api("sqlite/flushTransaction", {});
      await api("av/addAttributeViewBlocks", {
        avID: job.databaseID,
        srcs: [{ id: job.docId, isDetached: false }],
      });
      job.databaseAdded = true;
    }
    job.body = "saved";
    delete job.error;
  } catch (e) {
    job.body = "failed";
    job.error = String(e);
  }
  await changed();
}
