import { address, ENGINES, suggestions, type Config } from "./core";
export interface AddressCandidate {
  kind: "search" | "history" | "bookmark" | "url";
  title: string;
  value: string;
  url?: string;
}
export function addressCandidates(
  config: Config,
  query: string,
  remote: string[] = [],
): AddressCandidate[] {
  const q = query.trim();
  if (!q) return [];
  const template = ENGINES[config.engine] || config.customSearch;
  let target: string;
  try {
    target = address(q, template);
  } catch {
    return [];
  }
  const direct = target !== template.replaceAll("%s", encodeURIComponent(q));
  const local = suggestions(config, q).map((entry) => ({
    kind: config.bookmarks.some((b) => b.url === entry.url)
      ? ("bookmark" as const)
      : ("history" as const),
    title: entry.title || entry.url,
    value: entry.url,
    url: entry.url,
  }));
  const first: AddressCandidate = {
    kind: direct ? "url" : "search",
    title: q,
    value: target,
    url: direct ? target : undefined,
  };
  const terms = remote
    .filter(
      (term) =>
        typeof term === "string" &&
        term.trim() &&
        term.toLocaleLowerCase() !== q.toLocaleLowerCase(),
    )
    .map((term) => ({
      kind: "search" as const,
      title: term,
      value: template.replaceAll("%s", encodeURIComponent(term)),
    }));
  return [first, ...terms.slice(0, 4), ...local]
    .filter(
      (item, index, list) =>
        list.findIndex((x) => x.value === item.value) === index,
    )
    .slice(0, 10);
}
export function inlineCompletion(
  config: Config,
  query: string,
): string | undefined {
  if (!query || /\s/.test(query)) return;
  const lower = query.toLocaleLowerCase();
  for (const entry of suggestions(config, query)) {
    const value =
      /^https?:/i.test(query) ||
      "https://".startsWith(lower) ||
      "http://".startsWith(lower)
        ? entry.url
        : entry.url.replace(/^https?:\/\//i, "");
    if (
      value.toLocaleLowerCase().startsWith(lower) &&
      value.length > query.length
    )
      return query + value.slice(query.length);
  }
}
