export const MAX_SOURCE = 1024 * 1024;
export const GRANTS = new Set([
  "none",
  "GM_info",
  "GM_addStyle",
  "GM.getValue",
  "GM.setValue",
  "GM.deleteValue",
  "GM.listValues",
  "GM.openInTab",
  "GM_registerMenuCommand",
]);
export interface Metadata {
  name: string;
  namespace: string;
  version: string;
  description: string;
  matches: string[];
  excludes: string[];
  grants: string[];
  requires: string[];
  runAt: "document-end" | "document-idle";
  problems: string[];
}
const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** Deliberately only Chrome-style HTTP(S) patterns; never a raw regex. */
export function matchPattern(pattern: string): (url: string) => boolean {
  const parts = /^(https?|\*):\/\/(\*|\*\.[^/]+|[^/*]+)(\/.*)$/.exec(pattern);
  if (!parts) throw Error("Unsupported @match: " + pattern);
  const [, scheme, host, pathname] = parts;
  const hostname = host.startsWith("*.") ? host.slice(2) : host;
  if (
    host !== "*" &&
    (!/^[a-z0-9.-]+$/i.test(hostname) ||
      hostname.startsWith(".") ||
      hostname.endsWith(".") ||
      hostname.includes(".."))
  )
    throw Error("Unsupported host in @match: " + pattern);
  const re = new RegExp("^" + pathname.split("*").map(escape).join(".*") + "$");
  return (value) => {
    try {
      const u = new URL(value);
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
        return false;
      if (scheme !== "*" && u.protocol !== scheme + ":") return false;
      const h = hostname.toLowerCase();
      if (
        host !== "*" &&
        u.hostname !== h &&
        !(host.startsWith("*.") && u.hostname.endsWith("." + h))
      )
        return false;
      return re.test(u.pathname + u.search);
    } catch {
      return false;
    }
  };
}
export function matches(meta: Metadata, url: string): boolean {
  return (
    !meta.problems.length &&
    meta.matches.some((p) => matchPattern(p)(url)) &&
    !meta.excludes.some((p) => matchPattern(p)(url))
  );
}
export function parseScript(source: string): Metadata {
  if (
    typeof source !== "string" ||
    new TextEncoder().encode(source).byteLength > MAX_SOURCE
  )
    throw Error("Script exceeds 1 MiB");
  const block =
    /^\uFEFF?\s*\/\/\s*==UserScript==\s*\r?\n([\s\S]*?)^\s*\/\/\s*==\/UserScript==\s*$/m.exec(
      source,
    );
  if (!block || block.index !== 0)
    throw Error("Missing leading UserScript metadata block");
  const entries = new Map<string, string[]>();
  for (const line of block[1].split(/\r?\n/)) {
    const item = /^\s*\/\/\s*@([\w:-]+)(?:\s+(.*))?\s*$/.exec(line);
    if (item)
      entries.set(item[1], [
        ...(entries.get(item[1]) || []),
        (item[2] || "").trim(),
      ]);
  }
  const values = (key: string) => entries.get(key) || [];
  const first = (key: string, fallback = "") => values(key)[0] ?? fallback;
  const problems: string[] = [];
  const known = new Set([
    "name",
    "namespace",
    "version",
    "description",
    "match",
    "exclude-match",
    "grant",
    "require",
    "run-at",
    "noframes",
    "author",
    "license",
    "homepage",
    "homepageURL",
    "supportURL",
    "icon",
    "icon64",
    "downloadURL",
    "updateURL",
  ]);
  for (const key of entries.keys()) {
    if (!known.has(key) && !/^(name|description):[\w-]+$/.test(key))
      problems.push("Unsupported @" + key);
  }
  for (const key of ["name", "namespace", "version", "run-at"])
    if (values(key).length > 1) problems.push("Duplicate @" + key);
  if (!first("name") || first("name").length > 200)
    problems.push("@name must be 1–200 characters");
  if (first("namespace").length > 500)
    problems.push("@namespace exceeds 500 characters");
  if (!entries.has("noframes"))
    problems.push("This version requires @noframes (top frame only)");
  const patterns = values("match");
  if (!patterns.length)
    problems.push("At least one HTTP(S) @match is required");
  if (patterns.length + values("exclude-match").length > 100)
    problems.push("Too many match patterns");
  for (const p of [...patterns, ...values("exclude-match")]) {
    try {
      matchPattern(p);
    } catch (e) {
      problems.push(String(e));
    }
  }
  const grants = [...new Set(values("grant"))];
  if (!grants.length)
    problems.push(
      "Explicit @grant required (use @grant none for page scripts)",
    );
  for (const grant of grants)
    if (!GRANTS.has(grant)) problems.push("Unsupported @grant " + grant);
  if (grants.includes("none") && grants.length > 1)
    problems.push("@grant none cannot be combined with other grants");
  const runAt = first("run-at", "document-end");
  if (!["document-end", "document-idle"].includes(runAt))
    problems.push("Unsupported @run-at " + runAt);
  if (values("require").length > 8)
    problems.push("At most 8 @require dependencies");
  for (const value of values("require")) {
    try {
      const u = new URL(value);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.hash ||
        (u.port && u.port !== "443")
      )
        throw Error();
    } catch {
      problems.push(
        "@require must be an HTTPS URL without credentials, fragment or custom port",
      );
    }
  }
  return {
    name: first("name"),
    namespace: first("namespace"),
    version: first("version"),
    description: first("description"),
    matches: patterns,
    excludes: values("exclude-match"),
    grants,
    requires: values("require"),
    runAt: runAt as Metadata["runAt"],
    problems,
  };
}
