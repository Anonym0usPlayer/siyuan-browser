import {
  snapshotBody,
  SNAPSHOT_TIME,
  SNAPSHOT_HASH,
  type BookmarkSnapshot,
} from "./bookmark-snapshot";
import { api } from "./api";
import { httpURL, safeTitle } from "./core";
import { normalizeParentPath } from "./destination";

export const BOOKMARK_KIND = "custom-siyuan-browser-kind";
export const BOOKMARK_URL = "custom-siyuan-browser-url";
export function bookmarkURL(
  attrs: Record<string, string> | undefined,
): string | undefined {
  const url = attrs?.[BOOKMARK_URL];
  return attrs?.[BOOKMARK_KIND] === "bookmark" &&
    typeof url === "string" &&
    httpURL(url)
    ? url
    : undefined;
}
export async function createBookmarkNote(
  notebook: string,
  parent: string,
  title: string,
  url: string,
  favicon?: string,
  content?: BookmarkSnapshot,
): Promise<string> {
  if (!httpURL(url)) throw Error("Invalid bookmark URL");
  // Encode characters that could terminate the Markdown autolink or IAL value.
  const source = new URL(url).href.replace(/[<>"\\]/g, (c) =>
    encodeURIComponent(c),
  );
  const path = normalizeParentPath(parent);
  const id = await api<string>("filetree/createDocWithMd", {
    notebook,
    path:
      (path === "/" ? "" : path) +
      "/" +
      safeTitle(title || new URL(source).hostname),
    markdown:
      `#网页书签#\n\n<${source}>\n\n` +
      (content
        ? snapshotBody(source, content)
        : "此文档是网页书签，尚未采集正文快照。\n"),
  });
  try {
    await api("attr/setBlockAttrs", {
      id,
      attrs: {
        [BOOKMARK_KIND]: "bookmark",
        [BOOKMARK_URL]: source,
        ...(content
          ? { [SNAPSHOT_TIME]: content.updated, [SNAPSHOT_HASH]: content.hash }
          : {}),
        icon: favicon && httpURL(favicon) ? favicon : "1f310",
      },
    });
  } catch (error) {
    throw Error(
      `书签文档已创建 (${id})，但设置跳转属性失败，请勿重复保存：${error}`,
    );
  }
  return id;
}
