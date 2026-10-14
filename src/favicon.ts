import { httpURL, type Config, type Entry } from "./core";

export const FAVICON_BYTES = 150000;
type Resource = { mime: string; base64: string };

/** Use a site's known icon for older entries that predate favicon recording. */
export function storedFavicon(config: Config, url: string): string | undefined {
  if (!httpURL(url)) return undefined;
  const entries = [
    ...config.history,
    ...config.bookmarks,
    ...config.recentlyClosed,
  ];
  const valid = (entry: Entry) =>
    typeof entry.favicon === "string" &&
    entry.favicon.length <= 4096 &&
    httpURL(entry.favicon);
  const exact = entries.find((entry) => entry.url === url && valid(entry));
  if (exact) return exact.favicon;
  const origin = new URL(url).origin;
  return entries.find(
    (entry) => valid(entry) && new URL(entry.url).origin === origin,
  )?.favicon;
}

export function entryFaviconURL(config: Config, entry: Entry): string {
  if (
    typeof entry.favicon === "string" &&
    entry.favicon.length <= 4096 &&
    httpURL(entry.favicon)
  )
    return entry.favicon;
  return (
    storedFavicon(config, entry.url) || new URL("/favicon.ico", entry.url).href
  );
}

/** Fetch through the isolated browser session, never the SiYuan renderer session. */
export class FaviconCache {
  private cache = new Map<
    string,
    { promise: Promise<string | undefined>; expires: number }
  >();
  private queue: (() => void)[] = [];
  private running = 0;
  private disposed = false;
  constructor(private request: (url: string) => Promise<Resource>) {}

  get(url: string): Promise<string | undefined> {
    if (this.disposed || !httpURL(url) || url.length > 4096)
      return Promise.resolve(undefined);
    const cached = this.cache.get(url);
    if (cached && cached.expires > Date.now()) {
      this.cache.delete(url);
      this.cache.set(url, cached);
      return cached.promise;
    }
    let resolve!: (value: string | undefined) => void;
    const record = {
      promise: new Promise<string | undefined>((done) => {
        resolve = done;
      }),
      expires: Infinity,
    };
    this.cache.set(url, record);
    if (this.cache.size > 256)
      this.cache.delete(this.cache.keys().next().value!);
    this.queue.push(() => {
      if (this.disposed) {
        resolve(undefined);
        return;
      }
      this.running++;
      void (async () => {
        let result: string | undefined;
        try {
          const data = await this.request(url);
          const mime = data.mime.split(";")[0].trim().toLowerCase();
          if (
            /^image\/(png|jpeg|gif|webp|x-icon|vnd.microsoft.icon)$/.test(
              mime,
            ) &&
            typeof data.base64 === "string" &&
            data.base64.length > 0 &&
            data.base64.length <= (FAVICON_BYTES * 4) / 3 &&
            /^[A-Za-z0-9+/]*={0,2}$/.test(data.base64)
          )
            result = "data:" + mime + ";base64," + data.base64;
        } catch {
          /* Missing icons keep the hostname initial without an error toast. */
        }
        record.expires = result ? Infinity : Date.now() + 60000;
        resolve(this.disposed ? undefined : result);
        this.running--;
        this.drain();
      })();
    });
    this.drain();
    return record.promise;
  }
  private drain() {
    while ((this.disposed || this.running < 6) && this.queue.length)
      this.queue.shift()!();
  }
  dispose() {
    this.disposed = true;
    this.drain();
    this.cache.clear();
  }
}
