import fs from "node:fs/promises";
import path from "node:path";
const packages = [
  "defuddle",
  "mathml-to-latex",
  "@xmldom/xmldom",
  "temml",
  "dompurify",
  "turndown",
  "@mixmark-io/domino",
  "@ghostery/adblocker",
  "@ghostery/adblocker-content",
  "@ghostery/adblocker-extended-selectors",
  "@ghostery/adblocker-cosmetics",
  "@ghostery/url-parser",
  "@remusao/guess-url-type",
  "@remusao/small",
  "@remusao/smaz",
  "@remusao/smaz-compress",
  "@remusao/smaz-decompress",
  "@remusao/trie",
  "tldts-experimental",
  "tldts-core",
];
let out =
  "# Third-party notices\n\nContent extraction and Markdown conversion use Defuddle (https://github.com/kepano/defuddle), the open-source engine created for Obsidian Web Clipper. The full browser bundle includes math conversion and Turndown. SiYuan integration is authored separately. SiYuan SDK is an external host interface. EasyList/EasyPrivacy subscriptions retain their respective list licenses (https://easylist.to/pages/licence.html); downloaded rules are not bundled.\n";
for (const name of packages) {
  const dir = "node_modules/" + name;
  try {
    const pkg = JSON.parse(
      await fs.readFile(path.join(dir, "package.json"), "utf8"),
    );
    out += "\n## " + name + " " + pkg.version + " (" + pkg.license + ")\n\n";
    const files = await fs.readdir(dir);
    for (const f of files.filter((f) => /^licen[cs]e|^copying/i.test(f)))
      out += (await fs.readFile(path.join(dir, f), "utf8")) + "\n";
  } catch {}
}
await fs.writeFile(
  "THIRD_PARTY_NOTICES.md",
  out.replace(/\r\n?/g, "\n").replace(/[\t ]+$/gm, "").trimEnd() + "\n",
);
