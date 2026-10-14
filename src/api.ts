export async function api<T = any>(
  endpoint: string,
  data: unknown,
): Promise<T> {
  const r = await fetch("/api/" + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw Error("Kernel HTTP " + r.status);
  const result = await r.json();
  if (result.code !== 0) throw Error(result.msg || "Kernel error");
  return result.data;
}
export async function upload(
  name: string,
  bytes: Uint8Array,
  mime = "application/octet-stream",
): Promise<string> {
  const f = new FormData();
  f.append("assetsDirPath", "/assets/");
  f.append("file[]", new Blob([bytes as BlobPart], { type: mime }), name);
  const r = await fetch("/api/asset/upload", { method: "POST", body: f });
  const j = await r.json();
  if (!r.ok || j.code !== 0 || j.data?.errFiles?.length)
    throw Error(j.msg || "Asset upload failed");
  const value = Object.values(j.data?.succMap || {})[0];
  if (typeof value !== "string" || !value.startsWith("assets/"))
    throw Error("No asset returned");
  return value;
}
export const bytes = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
