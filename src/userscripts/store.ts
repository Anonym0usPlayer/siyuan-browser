import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parseScript, type Metadata } from "./metadata";

export interface Dependency {
  url: string;
  source: string;
  sha256: string;
}
export interface UserScript {
  id: string;
  source: string;
  meta: Metadata;
  enabled: boolean;
  revision: string;
  dependencies: Dependency[];
  values: Record<string, unknown>;
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const scriptID = (meta: Metadata) =>
  digest(JSON.stringify([meta.namespace, meta.name]));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const own = (o: object, key: string) =>
  Object.prototype.hasOwnProperty.call(o, key);
interface StoreState {
  scripts: UserScript[];
  loaded: boolean;
  queue: Promise<unknown>;
}
const registry = globalThis as typeof globalThis & {
  __siyuanUserScriptStoreState?: Map<string, StoreState>;
};
const shared = (registry.__siyuanUserScriptStoreState ??= new Map<
  string,
  StoreState
>());

/** All writes, including GM writes from different tabs, use one session queue. */
export class UserScriptStore {
  private state: StoreState;
  private get scripts() {
    return this.state.scripts;
  }
  private set scripts(value: UserScript[]) {
    this.state.scripts = value;
  }
  constructor(readonly file: string) {
    // Retain data/queue, not class methods, across hashed main-module hot reloads.
    this.state = shared.get(file) || {
      scripts: [],
      loaded: false,
      queue: Promise.resolve(),
    };
    shared.set(file, this.state);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const work = this.state.queue
      .catch(() => {})
      .then(async () => {
        await this.load();
        return fn();
      });
    this.state.queue = work;
    return work;
  }
  private async load() {
    if (this.state.loaded) return;
    let raw: any;
    try {
      raw = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (e: any) {
      if (e.code !== "ENOENT")
        throw Error("Cannot read userscript store: " + e);
    }
    if (raw !== undefined) {
      if (
        !raw ||
        raw.version !== 1 ||
        !Array.isArray(raw.scripts) ||
        raw.scripts.length > 100
      )
        throw Error("Invalid userscript store; restore from backup");
      this.scripts = raw.scripts.map((item: UserScript) => {
        const meta = parseScript(item.source);
        if (
          item.id !== scriptID(meta) ||
          typeof item.revision !== "string" ||
          !Array.isArray(item.dependencies) ||
          item.dependencies.length !== meta.requires.length ||
          !item.values ||
          typeof item.values !== "object" ||
          Array.isArray(item.values)
        )
          throw Error("Invalid userscript record");
        for (const [i, dep] of item.dependencies.entries())
          if (
            dep.url !== meta.requires[i] ||
            typeof dep.source !== "string" ||
            Buffer.byteLength(dep.source) > 1024 * 1024 ||
            digest(dep.source) !== dep.sha256
          )
            throw Error("Invalid userscript dependency snapshot");
        return {
          ...item,
          meta,
          enabled: !!item.enabled && !meta.problems.length,
        };
      });
    }
    this.state.loaded = true;
  }
  private async commit(next: UserScript[]) {
    const data = JSON.stringify({ version: 1, scripts: next });
    if (Buffer.byteLength(data) > 32 * 1024 * 1024)
      throw Error("Userscript store exceeds 32 MiB");
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temp = this.file + "." + randomUUID() + ".tmp";
    try {
      await fs.writeFile(temp, data, { mode: 0o600 });
      await fs.rename(temp, this.file);
      this.scripts = next;
    } finally {
      await fs.rm(temp, { force: true });
    }
  }
  list(): Promise<UserScript[]> {
    return this.serial(async () => clone(this.scripts));
  }
  install(source: string, dependencies: Dependency[]): Promise<string> {
    return this.serial(async () => {
      const meta = parseScript(source);
      if (meta.problems.length) throw Error(meta.problems.join("\n"));
      if (
        dependencies.length !== meta.requires.length ||
        dependencies.some(
          (d, i) => d.url !== meta.requires[i] || digest(d.source) !== d.sha256,
        )
      )
        throw Error("Invalid dependencies");
      const id = scriptID(meta),
        old = this.scripts.find((s) => s.id === id);
      if (!old && this.scripts.length >= 100)
        throw Error("At most 100 userscripts");
      const next = this.scripts.filter((s) => s.id !== id);
      next.push({
        id,
        meta,
        source,
        dependencies: clone(dependencies),
        enabled: false,
        revision: randomUUID(),
        values: old?.values || {},
      });
      await this.commit(next);
      return id;
    });
  }
  change(id: string, action: "enable" | "disable" | "remove" | "clear") {
    return this.serial(async () => {
      const next = clone(this.scripts),
        script = next.find((s) => s.id === id);
      if (!script) throw Error("Unknown userscript");
      if (action === "enable" && script.meta.problems.length)
        throw Error(script.meta.problems.join("\n"));
      if (action === "enable" || action === "disable")
        script.enabled = action === "enable";
      if (action === "clear") script.values = {};
      script.revision = randomUUID();
      await this.commit(
        action === "remove" ? next.filter((s) => s.id !== id) : next,
      );
    });
  }
  value(
    id: string,
    revision: string,
    operation: string,
    key?: string,
    value?: unknown,
    authorize: () => void = () => {},
  ) {
    return this.serial(async () => {
      // Recheck authorization inside the write queue, not only before awaiting it.
      authorize();
      const script = this.scripts.find((s) => s.id === id);
      if (!script?.enabled || script.revision !== revision)
        throw Error("Userscript was disabled or updated");
      if (!script.meta.grants.includes("GM." + operation))
        throw Error("Undeclared GM permission");
      if (operation === "listValues") return Object.keys(script.values);
      if (typeof key !== "string" || key.length > 200)
        throw Error("Invalid storage key");
      if (operation === "getValue")
        return own(script.values, key) ? clone(script.values[key]) : value;
      if (!["setValue", "deleteValue"].includes(operation))
        throw Error("Unknown storage operation");
      const values = { ...script.values };
      if (operation === "deleteValue") delete values[key];
      else {
        const serialized = JSON.stringify(value);
        if (
          serialized === undefined ||
          Buffer.byteLength(serialized) > 256 * 1024
        )
          throw Error("Value must be JSON, at most 256 KiB");
        Object.defineProperty(values, key, {
          value: JSON.parse(serialized),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      if (
        Object.keys(values).length > 1000 ||
        Buffer.byteLength(JSON.stringify(values)) > 1024 * 1024
      )
        throw Error("Script storage exceeds quota (1000 keys / 1 MiB)");
      authorize();
      await this.commit(
        this.scripts.map((s) => (s.id === id ? { ...s, values } : s)),
      );
      return undefined;
    });
  }
  async drained() {
    await this.state.queue.catch(() => {});
  }
}
