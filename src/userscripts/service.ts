import { randomUUID } from "node:crypto";
import { matches, parseScript } from "./metadata";
import { UserScriptStore, type UserScript } from "./store";
import { fetchDependency } from "./dependencies";

export const SCRIPT_CHANNEL = "siyuan-browser-userscripts-v1";
export const COMMAND_CHANNEL = "siyuan-browser-userscript-command-v1";
interface Run {
  token: string;
  script: UserScript;
  epoch: number;
  commands: Map<number, string>;
}
interface Guest {
  epoch: number;
  planned: boolean;
  runs: Map<string, Run>;
}
export class UserScriptService {
  private guests = new Map<any, Guest>();
  private logs: { time: number; name: string; url: string; message: string }[] =
    [];
  private active = true;
  constructor(
    readonly store: UserScriptStore,
    private owns: (w: any) => boolean,
    private open: (w: any, url: string, background: boolean) => void,
  ) {}
  register(w: any) {
    const guest: Guest = { epoch: 0, planned: false, runs: new Map() };
    this.guests.set(w, guest);
    w.on(
      "did-start-navigation",
      (_e: unknown, _url: string, inPlace: boolean, main: boolean) => {
        if (main && !inPlace) {
          guest.epoch++;
          guest.planned = false;
          guest.runs.clear();
        }
      },
    );
    w.once("destroyed", () => this.guests.delete(w));
  }
  private context(w: any, frame: any): Guest {
    if (
      !this.active ||
      !this.owns(w) ||
      !frame ||
      frame !== w.mainFrame ||
      !/^https?:\/\//.test(frame.url) ||
      !this.guests.has(w)
    )
      throw Error("Untrusted userscript frame");
    return this.guests.get(w)!;
  }
  private log(w: any, name: string, message: string) {
    this.logs.push({
      time: Date.now(),
      name,
      url: w.getURL(),
      message: message.slice(0, 500),
    });
    this.logs = this.logs.slice(-100);
  }
  async rpc(event: any, message: any) {
    const w = event.sender,
      frame = event.senderFrame;
    const guest = this.context(w, frame);
    if (!message || typeof message.op !== "string")
      throw Error("Invalid userscript request");
    if (message.op === "plans") {
      if (guest.planned) return [];
      guest.planned = true;
      const epoch = guest.epoch,
        url = frame.url;
      const scripts = await this.store.list();
      this.context(w, frame);
      if (guest.epoch !== epoch || frame.url !== url) return [];
      return scripts
        .filter((s) => s.enabled && matches(s.meta, url))
        .map((script) => {
          const token = randomUUID();
          guest.runs.set(token, { token, script, epoch, commands: new Map() });
          return {
            token,
            source: script.source,
            meta: script.meta,
            dependencies: script.dependencies.map((d) => d.source),
          };
        });
    }
    const run = guest.runs.get(message.token);
    const authorize = () => {
      this.context(w, frame);
      if (
        !run ||
        !guest.runs.has(run.token) ||
        guest.epoch !== run.epoch ||
        !matches(run.script.meta, frame.url)
      )
        throw Error("Userscript permission expired; reload the page");
    };
    authorize();
    if (message.op === "report") {
      if (typeof message.message === "string")
        this.log(w, run!.script.meta.name, message.message);
      return;
    }
    if (
      ["getValue", "setValue", "deleteValue", "listValues"].includes(message.op)
    )
      return this.store.value(
        run!.script.id,
        run!.script.revision,
        message.op,
        message.key,
        message.value,
        authorize,
      );
    if (message.op === "openInTab") {
      if (!run!.script.meta.grants.includes("GM.openInTab"))
        throw Error("Undeclared GM.openInTab");
      const url = new URL(message.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error("Only HTTP(S) tabs");
      this.open(w, url.href, message.background === true);
      return;
    }
    if (message.op === "registerMenuCommand") {
      if (!run!.script.meta.grants.includes("GM_registerMenuCommand"))
        throw Error("Undeclared menu permission");
      if (
        !Number.isSafeInteger(message.id) ||
        message.id < 1 ||
        message.id > 20 ||
        typeof message.label !== "string" ||
        !message.label.trim() ||
        message.label.length > 100
      )
        throw Error("Invalid menu command (maximum 20 per script)");
      run!.commands.set(message.id, message.label);
      return;
    }
    throw Error("Unsupported userscript operation");
  }
  async manage(action: string, payload: any = {}) {
    if (!this.active) throw Error("Userscript service closed");
    if (action === "list")
      return {
        scripts: (await this.store.list()).map(({ values, ...s }) => s),
        logs: this.logs,
      };
    if (action === "preview") return parseScript(payload.source);
    if (action === "install") {
      const meta = parseScript(payload.source);
      if (meta.problems.length) throw Error(meta.problems.join("\n"));
      const dependencies = [];
      for (const url of meta.requires)
        dependencies.push(await fetchDependency(url));
      if (!this.active) throw Error("Userscript service closed");
      const id = await this.store.install(payload.source, dependencies);
      this.revoke(id);
      return id;
    }
    if (["enable", "disable", "remove", "clear"].includes(action)) {
      // Revoke immediately, even if durable write fails; no old in-flight authority survives.
      this.revoke(payload.id);
      await this.store.change(
        payload.id,
        action as "enable" | "disable" | "remove" | "clear",
      );
      this.revoke(payload.id);
      return;
    }
    throw Error("Unknown userscript management action");
  }
  private revoke(id: string) {
    for (const [w, guest] of this.guests)
      for (const [token, run] of guest.runs)
        if (run.script.id === id) {
          guest.runs.delete(token);
          if (!w.isDestroyed?.()) w.send(COMMAND_CHANNEL, { revoke: token });
        }
  }
  commands(w: any) {
    if (!this.active || !this.owns(w)) return [];
    const guest = this.guests.get(w);
    return [...(guest?.runs.values() || [])]
      .filter((r) => matches(r.script.meta, w.getURL()))
      .flatMap((r) =>
        [...r.commands].map(([id, label]) => ({
          token: r.token,
          id,
          label: r.script.meta.name + " · " + label,
        })),
      );
  }
  command(w: any, token: string, id: number) {
    if (!this.commands(w).some((c) => c.token === token && c.id === id))
      throw Error("Menu command expired");
    w.send(COMMAND_CHANNEL, { token, id });
  }
  dispose() {
    this.active = false;
    this.guests.clear();
    this.logs = [];
  }
}
