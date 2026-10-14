import fs from "node:fs/promises";
import path from "node:path";
const test = path.resolve(".test-workspace");
const real = await fs.realpath(test);
if (!real.includes("siyuan-browser") || !real.includes("test"))
  throw Error("Refusing non-test workspace");
await fs.cp("dist", path.join(real, "data/plugins/siyuan-browser"), {
  recursive: true,
});
console.log("Installed only in " + real);
