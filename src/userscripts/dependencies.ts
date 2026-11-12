import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { digest, type Dependency } from "./store";

/** Restrict dependency downloads to public IPv4/IPv6, including DNS answers. */
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19].includes(b))
    );
  }
  // Only ordinary global unicast; exclude mapped/transition addresses.
  return (
    isIP(address) === 6 &&
    /^2[0-9a-f]{3}:/i.test(address) &&
    !/^(2001:(?:0:|db8:)|2002:)/i.test(address)
  );
}
export async function fetchDependency(
  url: string,
  redirects = 0,
): Promise<Dependency> {
  if (redirects > 4) throw Error("Too many dependency redirects");
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    (u.port && u.port !== "443")
  )
    throw Error("Dependency must use public HTTPS on port 443");
  const answers = await lookup(u.hostname, { all: true });
  if (!answers.length || answers.some((a) => !publicAddress(a.address)))
    throw Error("Private dependency addresses are forbidden");
  const answer = answers[0];
  const response = await new Promise<{ redirect?: string; source?: string }>(
    (resolve, reject) => {
      // Pin the validated address while preserving hostname/SNI/certificate checking.
      const req = request(
        u,
        {
          lookup: (_host, options, callback: any) =>
            options.all
              ? callback(null, [answer])
              : callback(null, answer.address, answer.family),
          headers: {
            "User-Agent": "SiYuan-Browser-Userscripts",
            "Accept-Encoding": "identity",
          },
        },
        (res) => {
          if (
            [301, 302, 303, 307, 308].includes(res.statusCode || 0) &&
            res.headers.location
          ) {
            res.resume();
            resolve({ redirect: new URL(res.headers.location, u).href });
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(Error("Dependency HTTP " + res.statusCode));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 1024 * 1024) {
              req.destroy(Error("Dependency exceeds 1 MiB"));
              return;
            }
            chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve({ source: Buffer.concat(chunks).toString("utf8") }),
          );
        },
      );
      const timer = setTimeout(
        () => req.destroy(Error("Dependency download timed out")),
        15000,
      );
      req.once("close", () => clearTimeout(timer));
      req.once("error", reject);
      req.end();
    },
  );
  if (response.redirect) {
    const next = await fetchDependency(response.redirect, redirects + 1);
    return { ...next, url };
  }
  return { url, source: response.source!, sha256: digest(response.source!) };
}
