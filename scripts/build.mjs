import { build } from "esbuild";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
await fs.rm("dist", { recursive: true, force: true });
await fs.mkdir("dist", { recursive: true });
await build({ entryPoints: ["src/preload.ts"], outfile: "dist/copy-preload.cjs", bundle: true, platform: "node", format: "cjs", external: ["electron"], target: "node22" });
const main = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  write: false,
});
const data = main.outputFiles[0].contents;
const filename =
  "desktop-" +
  createHash("sha256").update(data).digest("hex").slice(0, 12) +
  ".cjs";
await fs.writeFile("dist/" + filename, data);
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2022",
  external: ["siyuan"],
  define: { DESKTOP_FILENAME: JSON.stringify(filename) },
  sourcemap: true,
});
for (const name of [
  "plugin.json",
  "README.md",
  "README_zh_CN.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "icon.png",
  "preview.png",
  "CHANGELOG.md",
])
  await fs.copyFile(name, "dist/" + name);
await fs.cp("i18n", "dist/i18n", { recursive: true });
await fs.cp("docs", "dist/docs", { recursive: true });
await fs.rm("package.zip", { force: true });
execFileSync("zip", ["-qr", "../package.zip", "."], { cwd: "dist" });
console.log("Built dist/ and package.zip");
