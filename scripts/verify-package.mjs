import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const plugin = JSON.parse(await fs.readFile("plugin.json", "utf8"));
const project = JSON.parse(await fs.readFile("package.json", "utf8"));
assert.equal(plugin.name, "siyuan-browser");
assert.equal(plugin.url, "https://github.com/fu1fan/siyuan-browser");
assert.equal(plugin.version, project.version);
assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
assert.equal(plugin.disabledInPublish, true);
const files = execFileSync("unzip", ["-Z1", "package.zip"], { encoding: "utf8" })
  .trim().split(/\r?\n/).filter((name) => !name.endsWith("/"));
assert(files.every((name) => !name.startsWith("/") && !name.split("/").includes("..")));
assert(files.every((name) => !/(?:^|\/)(?:node_modules|\.test-runtime|\.git|config\.json)(?:\/|$)/.test(name)));
const required = ["index.js", "index.css", "copy-preload.cjs", "plugin.json", "LICENSE",
  "THIRD_PARTY_NOTICES.md", "CHANGELOG.md", "i18n/en_US.json", "i18n/zh_CN.json",
  plugin.icon, plugin.preview, ...Object.values(plugin.readme)];
for (const file of required) assert(files.includes(file), `Missing ${file}`);
assert.equal(files.filter((file) => /^desktop-[a-f0-9]+\.cjs$/.test(file)).length, 1);
for (const file of files) {
  const zipped = execFileSync("unzip", ["-p", "package.zip", file], { maxBuffer: 32 * 1024 * 1024 });
  assert.deepEqual(zipped, await fs.readFile(path.join("dist", file)), `Archive mismatch: ${file}`);
}
assert.deepEqual(JSON.parse(execFileSync("unzip", ["-p", "package.zip", "plugin.json"])), plugin);
for (const [file, limit] of [[plugin.icon, 64 * 1024], [plugin.preview, 512 * 1024]]) {
  const bytes = await fs.readFile(file);
  assert(bytes.length <= limit, `${file} exceeds Bazaar image limit`);
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
}
for (const readme of Object.values(plugin.readme)) {
  const md = await fs.readFile(readme, "utf8");
  for (const [, target] of md.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(target)) continue;
    assert(files.includes(target.split("#")[0]), `${readme}: missing local link ${target}`);
  }
}
console.log(`Verified ${files.length} package files, metadata, local README links and Bazaar image limits.`);
