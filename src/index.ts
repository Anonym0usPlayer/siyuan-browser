import { installDockSearch } from "./dock-search";
import { chooseDestination, resolveParentPath } from "./destination";
import {
  Plugin,
  Setting,
  Menu,
  openTab,
  openWindow,
  showMessage,
  getFrontend,
  saveLayout,
} from "siyuan";
import {
  Config,
  readConfig,
  ENGINES,
  address,
  httpURL,
  addHistory,
  recordVisit,
  updateHistoryTitle,
  addClosed,
  HOME_URL,
  INTERNAL_URLS,
  type LibraryKind,
  type ClosedEntry,
  type Entry,
  type HomeSection,
} from "./core";
import { homeLayoutControls } from "./home";
import { FaviconCache, FAVICON_BYTES, storedFavicon } from "./favicon";
import { DesktopBrowserAdapter } from "./adapter";
import { BrowserView } from "./view";
import {
  element,
  button,
  icon,
  iconButton,
  dialog,
  field,
  confirm,
} from "./ui";
import { api, upload, bytes } from "./api";
import { runSave, SaveJob } from "./archive";
import "./style.css";
export default class BrowserPlugin extends Plugin {
  config: Config = readConfig(undefined);
  adapter!: DesktopBrowserAdapter;
  favicons = new FaviconCache((url) =>
    this.adapter.bridge.resource(this.adapter.partition, url, FAVICON_BYTES),
  );
  views = new Set<BrowserView>();
  viewsByGuest = new Map<number, BrowserView>();
  active?: BrowserView;
  dockRefresh = new WeakMap<HTMLElement, () => void>();
  libraryRoots = new Set<HTMLElement>();
  jobs: SaveJob[] = [];
  saving = false;
  closing = false;
  timer?: ReturnType<typeof setTimeout>;
  ready: Promise<void> = Promise.resolve();
  pending: any[] = [];
  write: Promise<any> = Promise.resolve();
  t(key: string): string {
    return String(this.i18n?.[key] || key);
  }
  onload() {
    if (!["desktop", "desktop-window"].includes(getFrontend())) return;
    const p = this;
    this.addIcons(
      '<symbol id="iconBrowser" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 16h26M16 3c-9 8-9 18 0 26M16 3c9 8 9 18 0 26" fill="none" stroke="currentColor" stroke-width="2"/></symbol><symbol id="iconBrowserHome" viewBox="0 0 32 32"><path d="M3 15L16 4l13 11M7 13v15h18V13M12 28V18h8v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></symbol>',
    );
    this.addTab({
      type: "page",
      init() {
        if (p.adapter) p.mount(this);
        else p.pending.push(this);
      },
      update() {
        for (const v of p.views) if (v.custom === this) p.active = v;
        p.refreshDocks();
      },
      destroy() {
        for (const v of p.views) if (v.custom === this) v.destroy();
      },
    });
    this.addDock({
      type: "library",
      config: {
        position: "LeftBottom",
        size: { width: 280, height: 400 },
        icon: "iconBrowser",
        title: this.t("library"),
      },
      data: {},
      init() {
        p.libraryRoots.add(this.element as HTMLElement);
        p.renderLibrary(this.element as HTMLElement);
      },
      destroy() {
        p.libraryRoots.delete(this.element as HTMLElement);
      },
    });
    const commands: [string, () => void][] = [
      ["open", () => this.open(this.config.home)],
      ["history", () => this.showLibrary("history")],
      ["bookmarks", () => this.showLibrary("bookmarks")],
      ["browserHome", () => this.open(HOME_URL)],
      [
        "reopenClosed",
        () => {
          const entry = this.config.recentlyClosed[0];
          if (entry) this.guard(() => this.reopen(entry));
        },
      ],
      ["search", () => this.openSearch()],
      ["focus", () => this.active?.bar.focus()],
      [
        "reader",
        () => this.active && this.guard(() => this.active!.toggleReader()),
      ],
      [
        "save",
        () => this.active && this.guard(() => this.savePage(this.active!)),
      ],
    ];
    for (const [key, fn] of commands)
      this.addCommand({ langKey: key, langText: this.t(key), callback: fn });
    this.addTopBar({
      icon: "iconBrowser",
      title: this.t("open"),
      callback: () => this.open(this.config.home),
    });
    this.ready = this.initialize();
    this.eventBus.on("open-link", this.openLink);
    this.eventBus.on("open-menu-link", this.linkMenu);
    return this.ready;
  }
  async onDataChanged() {
    if (!this.closing) {
      this.config = readConfig(await this.loadData("config.json"));
      this.refreshPages();
    }
  }
  async initialize() {
    this.config = readConfig(await this.loadData("config.json"));
    this.jobs = (await this.loadData("jobs.json")) || [];
    if (!Array.isArray(this.jobs)) this.jobs = [];
    this.adapter = new DesktopBrowserAdapter(
      window.siyuan.config.system.workspaceDir,
      (e) => this.event(e),
    );
    for (const custom of this.pending) this.mount(custom);
    this.pending = [];
    if (this.adapter.partition)
      Object.assign(
        this.config,
        await this.adapter.bridge.filterSettings(this.config),
      );
    this.makeSettings();
    if (this.adapter.partition)
      this.guard(async () => {
        const result = await this.adapter.bridge.configure(
          this.adapter.partition,
          this.config,
        );
        if (result?.error) showMessage(this.t("filterError") + result.error);
      });
    for (const d of this.libraryRoots) this.renderLibrary(d);
  }
  mount(custom: any) {
    this.guard(async () => {
      const data = { ...(custom.data || {}) };
      if (data.archiveAsset) {
        data.archive = await this.prepareArchive(data.archiveAsset);
        data.url = data.archive.url;
      }
      const v = new BrowserView(this, custom, data);
      this.views.add(v);
      this.refreshDocks();
    });
  }
  openLink = (e: CustomEvent) => {
    const href = e.detail?.href;
    if (this.config.takeover && httpURL(href)) {
      e.preventDefault();
      void this.open(href);
    } else if (/^assets\/web-[\w-]+\.mhtml$/.test(href || "")) {
      e.preventDefault();
      this.guard(() => this.openArchive(href));
    }
  };
  linkMenu = (e: CustomEvent) => {
    const href =
      e.detail?.element?.getAttribute("data-href") ||
      e.detail?.element?.getAttribute("href");
    if (httpURL(href)) {
      e.detail.menu.addItem({
        label: this.t("open"),
        icon: "iconBrowser",
        click: () => this.open(href),
      });
      e.detail.menu.addItem({
        label: this.t("external"),
        click: () => this.adapter.external(href),
      });
    }
  };
  async open(
    url: string,
    position?: "right" | "bottom",
    background = false,
    newWindow = false,
  ) {
    await this.ready;
    if (this.closing) return;
    const tab = await openTab({
      app: this.app,
      custom: {
        id: this.name + "page",
        icon: "iconBrowser",
        title: this.t("open"),
        data: {
          url: address(url, this.searchTemplate()),
          instanceId: crypto.randomUUID(),
        },
      },
      position,
      keepCursor: background,
      openNewTab: true,
    });
    if (newWindow) {
      const view = [...this.views].find((v) => v.custom.tab === tab);
      if (view) view.transferring = true;
      openWindow({ tab });
    }
    return tab;
  }
  searchTemplate() {
    return ENGINES[this.config.engine] || this.config.customSearch;
  }
  event(e: any) {
    if (e.type === "download") {
      showMessage(e.name + ": " + e.state);
      return;
    }
    const v = this.viewsByGuest.get(e.id);
    if (e.type === "popup") {
      void this.open(e.url, undefined, e.background);
      return;
    }
    if (!v) return;
    this.active = v;
    if (e.type === "context") v.context(e.params);
    if (e.type === "key") {
      const i = e.input,
        key = i.key.toLowerCase();
      if (key === "l") {
        v.bar.focus();
        v.bar.select();
      } else if (key === "f") v.showFind();
      else {
        const event = new KeyboardEvent("keydown", {
          key: i.key,
          code: i.code,
          ctrlKey: i.control,
          metaKey: i.meta,
          shiftKey: i.shift,
          altKey: i.alt,
          bubbles: true,
          cancelable: true,
        });
        document.activeElement?.dispatchEvent(event);
      }
    }
  }
  async guard(fn: () => Promise<any>) {
    try {
      await fn();
    } catch (e) {
      showMessage(String(e), 7000, "error");
    }
  }
  persist() {
    this.refreshPages();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.closing) return;
      saveLayout(() => {});
      this.write = this.write
        .then(() => this.saveData("config.json", this.config))
        .catch((e) => showMessage(String(e)));
    }, 200);
  }
  visit(url: string, title: string) {
    if (!httpURL(url)) return;
    this.config.history = recordVisit(this.config.history, {
      url,
      title,
      time: Date.now(),
    });
    this.persist();
  }
  updateTitle(url: string, title: string) {
    if (!httpURL(url)) return;
    this.config.history = updateHistoryTitle(this.config.history, url, title);
    this.persist();
  }
  updateFavicon(url: string, favicon: string) {
    if (
      this.closing ||
      !httpURL(url) ||
      !httpURL(favicon) ||
      favicon.length > 4096
    )
      return;
    let changed = false;
    for (const kind of ["history", "bookmarks", "recentlyClosed"] as const)
      for (const entry of this.config[kind])
        if (entry.url === url && entry.favicon !== favicon) {
          entry.favicon = favicon;
          changed = true;
        }
    if (changed) this.persist();
  }
  closed(url: string, title: string) {
    this.config.recentlyClosed = addClosed(this.config.recentlyClosed, {
      id: crypto.randomUUID(),
      url,
      title,
      time: Date.now(),
      favicon: storedFavicon(this.config, url),
    });
    this.persist();
  }
  removeClosed(id: string) {
    this.config.recentlyClosed = this.config.recentlyClosed.filter(
      (entry) => entry.id !== id,
    );
    this.persist();
  }
  async reopen(entry: ClosedEntry) {
    const tab = await this.open(entry.url);
    if (tab) this.removeClosed(entry.id);
  }
  removeEntry(kind: "bookmarks" | "history", url: string) {
    this.config[kind] = this.config[kind].filter((entry) => entry.url !== url);
    this.persist();
  }
  refreshPages() {
    for (const view of this.views) view.refreshInternalPages();
    for (const root of this.libraryRoots) this.renderLibrary(root);
  }
  addBookmark(input: string, title: string) {
    const raw = input.trim();
    const url = address(raw, this.searchTemplate());
    if (!httpURL(url) || (!httpURL(raw) && url !== "https://" + raw))
      throw Error("Invalid bookmark URL");
    this.bookmark(url, title.trim() || new URL(url).hostname);
  }
  homeEntryMenu(entry: Entry, section: HomeSection, event: MouseEvent) {
    const menu = new Menu();
    menu.addItem({
      label: this.t("newTab"),
      icon: "iconBrowser",
      click: async () => {
        if (section === "recentlyClosed")
          await this.reopen(entry as ClosedEntry);
        else await this.open(entry.url);
      },
    });
    menu.addItem({
      label: this.t("right"),
      click: async () => {
        await this.open(entry.url, "right");
      },
    });
    menu.addItem({
      label: this.t("external"),
      click: () => this.adapter.external(entry.url),
    });
    menu.addItem({
      label: this.t("copyLink"),
      click: () => window.require("electron").clipboard.writeText(entry.url),
    });
    if (section !== "bookmarks")
      menu.addItem({
        label: this.t("bookmark"),
        icon: "iconBookmark",
        click: () => this.bookmark(entry.url, entry.title),
      });
    menu.open({ x: event.clientX, y: event.clientY });
  }
  bookmark(url: string, title: string) {
    if (!httpURL(url)) return;
    this.config.bookmarks = addHistory(this.config.bookmarks, {
      url,
      title,
      time: Date.now(),
      favicon: storedFavicon(this.config, url),
    });
    this.persist();
    showMessage(this.t("bookmarked"));
  }
  refreshDocks() {
    for (const root of this.libraryRoots) this.renderLibrary(root);
  }
  renderLibrary(root: HTMLElement) {
    const existing = this.dockRefresh.get(root);
    if (existing) {
      existing();
      return;
    }
    root.replaceChildren();
    root.classList.add("sb-library", "sb-dock");
    const header = element("div", "sb-dock-header");
    const heading = element("div", "block__icons sb-dock-heading");
    const homeButton = iconButton("iconBrowserHome", this.t("open"), () => {
      void this.open(HOME_URL);
    });
    homeButton.className = "block__icon sb-dock-icon";
    heading.append(element("span", "", this.t("sidebarTitle")), homeButton);
    const search = element("input", "b3-text-field sb-dock-search");
    search.placeholder = this.t("sidebarSearch");
    search.setAttribute("aria-label", this.t("sidebarSearch"));
    const tabs = element("div", "sb-dock-tabs");
    const list = element("div", "sb-dock-list");
    const results = element("div", "b3-list sb-dock-results");
    const searchRow = element("div", "sb-dock-search-wrap");
    const searchControl = installDockSearch(list, search, searchRow);
    const collapse = iconButton(
      "collapse",
      this.t("collapseSearch"),
      searchControl.hide,
    );
    collapse.className = "block__icon sb-dock-icon";
    searchRow.append(search, collapse);
    list.append(searchRow, results);
    let selected: "tabs" | "bookmarks" | "history" = "tabs";
    let limit = 100;
    const controls = new Map<string, HTMLButtonElement>();
    const refresh = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const entries =
        selected === "tabs"
          ? [...this.views]
              .filter((v) => !v.disposed)
              .map((v) => ({ title: v.title, url: v.url, view: v }))
          : this.config[selected].map((e) => ({ ...e, view: undefined }));
      const matches = entries.filter((e) =>
        (e.title + " " + e.url).toLocaleLowerCase().includes(query),
      );
      for (const [kind, control] of controls) {
        control.classList.toggle("b3-list-item--focus", kind === selected);
        control.setAttribute("aria-pressed", String(kind === selected));
      }
      results.replaceChildren(
        element(
          "div",
          "sb-dock-count",
          this.t(selected === "tabs" ? "openTabs" : selected) +
            " · " +
            matches.length,
        ),
      );
      for (const entry of matches.slice(0, limit)) {
        const row = button(
          "",
          () => {
            if (entry.view) {
              const tab = entry.view.custom.tab;
              tab.parent.switchTab(tab.headElement);
              this.active = entry.view;
              refresh();
            } else void this.open(entry.url);
          },
          entry.title + "\n" + entry.url,
        );
        row.className = "b3-list-item sb-dock-row";
        row.classList.toggle(
          "sb-active",
          !!entry.view && entry.view === this.active,
        );
        row.append(
          element("span", "sb-dock-title", entry.title || entry.url),
          element("span", "sb-dock-url", entry.url),
        );
        results.append(row);
      }
      if (!matches.length) {
        const empty = element("div", "sb-dock-empty");
        empty.append(
          icon(
            selected === "bookmarks"
              ? "iconBookmark"
              : selected === "history"
                ? "iconHistory"
                : "iconBrowserHome",
          ),
          element("p", "", this.t(query ? "sidebarNoResults" : "sidebarEmpty")),
          element(
            "span",
            "",
            this.t(
              query ? "sidebarSearchHint" : "sidebarEmptyHint_" + selected,
            ),
          ),
        );
        if (!query && selected === "tabs")
          empty.append(
            button(this.t("open"), () => {
              void this.open(HOME_URL);
            }),
          );
        results.append(empty);
      }
      if (matches.length > limit)
        results.append(
          button(this.t("showMore"), () => {
            limit += 100;
            refresh();
          }),
        );
    };
    for (const kind of ["tabs", "bookmarks", "history"] as const) {
      const control = button(this.t("sidebarTab_" + kind), () => {
        selected = kind;
        limit = 100;
        refresh();
      });
      control.className = "b3-list-item sb-dock-tab";
      controls.set(kind, control);
      tabs.append(control);
    }
    search.addEventListener("input", () => {
      limit = 100;
      refresh();
    });
    header.append(heading, tabs);
    root.append(header, list);
    this.dockRefresh.set(root, refresh);
    refresh();
  }
  showLibrary(kind: LibraryKind) {
    return this.open(INTERNAL_URLS[kind]);
  }
  clearEntries(kind: LibraryKind) {
    confirm(
      this.t(kind === "history" ? "clearHistory" : "clearBookmarks"),
      this.t("confirmHistory"),
      () => {
        this.config[kind] = [];
        this.persist();
      },
    );
  }
  openSearch() {
    const d = dialog(this.t("search"));
    const input = element("input", "b3-text-field");
    input.placeholder = this.t("address");
    d.body.append(
      input,
      button(this.t("open"), () => {
        this.open(input.value);
        d.dialog.destroy();
      }),
    );
    d.dialog.bindInput(input, () => {
      this.open(input.value);
      d.dialog.destroy();
    });
    input.focus();
  }
  openSetting() {
    this.makeSettings();
    super.openSetting();
  }
  makeSettings() {
    this.setting = new Setting({
      confirmCallback: () => {
        this.persist();
        if (this.adapter.partition)
          this.guard(() =>
            this.adapter.bridge.configure(this.adapter.partition, this.config),
          );
      },
    });
    const checkbox = (key: "takeover" | "adblock") => {
      const i = element("input", "b3-switch");
      i.type = "checkbox";
      i.checked = this.config[key];
      i.onchange = () => (this.config[key] = i.checked);
      return i;
    };
    for (const key of ["takeover", "adblock"] as const)
      this.setting.addItem({
        title: this.t(key),
        actionElement: checkbox(key),
      });
    const select = element("select", "b3-select");
    for (const name of [...Object.keys(ENGINES), "Custom"])
      select.add(new Option(name, name));
    select.value = this.config.engine;
    select.onchange = () => (this.config.engine = select.value);
    this.setting.addItem({ title: this.t("engine"), actionElement: select });
    for (const key of ["home", "customSearch"] as const) {
      const input = element("input", "b3-text-field");
      input.value = this.config[key];
      input.onchange = () => {
        try {
          if (key === "customSearch") {
            if (!input.value.includes("%s")) throw Error("Missing %s");
            address("test query", input.value);
          }
          this.config[key] =
            key === "home" ? address(input.value) : input.value;
        } catch (e) {
          showMessage(String(e), "5000" as any, "error");
        }
      };
      if (key === "home") {
        const row = element("div", "sb-home-setting");
        input.placeholder = HOME_URL;
        row.append(
          input,
          button(this.t("useBuiltInHome"), () => {
            this.config.home = HOME_URL;
            input.value = HOME_URL;
            this.persist();
          }),
        );
        this.setting.addItem({
          title: this.t(key),
          description: this.t("homeHint"),
          actionElement: row,
        });
      } else this.setting.addItem({ title: this.t(key), actionElement: input });
    }
    this.setting.addItem({
      title: this.t("customizeHome"),
      description: this.t("homeLayoutHint"),
      actionElement: homeLayoutControls(this),
    });
    this.setting.addItem({
      title: this.t("filterStatus"),
      description: this.adapter.partition
        ? (() => {
            const s = this.adapter.bridge.status(this.adapter.partition);
            return (
              this.t(s.filterLoaded ? "filterReady" : "filterMissing") +
              (s.filterError ? " — " + s.filterError : "")
            );
          })()
        : this.adapter.reason,
      actionElement: button(this.t("updateNow"), () =>
        this.guard(async () => {
          const result = await this.adapter.bridge.configure(
            this.adapter.partition,
            this.config,
            true,
          );
          showMessage(result.error || this.t("done"));
        }),
      ),
    });
    const lists = element("textarea", "b3-text-field");
    lists.value = this.config.subscriptions.join("\n");
    lists.onchange = () =>
      (this.config.subscriptions = lists.value
        .split("\n")
        .map((s) => s.trim())
        .filter(httpURL));
    this.setting.addItem({
      title: this.t("subscriptions"),
      description: this.t("filterScope"),
      actionElement: lists,
    });
    const days = element("input", "b3-text-field");
    days.type = "number";
    days.min = "0";
    days.max = "24";
    days.value = String(this.config.updateDays);
    days.onchange = () =>
      (this.config.updateDays = Math.max(
        0,
        Math.min(24, Number(days.value) || 0),
      ));
    this.setting.addItem({ title: this.t("updateDays"), actionElement: days });
    this.setting.addItem({
      title: this.t("destination"),
      actionElement: button(this.t("choose"), () =>
        this.guard(() => this.destination(true)),
      ),
    });
    this.setting.addItem({
      title: this.t("jobs"),
      actionElement: button(this.t("jobs"), () => this.showJobs()),
    });
    this.setting.addItem({
      title: this.t("clear"),
      actionElement: button(this.t("clear"), () => this.clearDialog()),
    });
  }
  clearDialog() {
    const d = dialog(this.t("clear"));
    d.body.append(element("p", "", this.t("clearScope")));
    for (const kind of ["cookies", "cache", "history", "all"])
      d.body.append(
        button(this.t(kind), () =>
          confirm(
            this.t("clear"),
            this.t("clearScope") + " — " + this.t(kind),
            () =>
              this.guard(async () => {
                if (kind === "history" || kind === "all") {
                  this.config.history = [];
                  this.config.recentlyClosed = [];
                  this.persist();
                }
                if (kind !== "history")
                  await this.adapter.bridge.clear(this.adapter.partition, kind);
                d.dialog.destroy();
                showMessage(this.t("done"));
              }),
          ),
        ),
      );
  }
  async destination(force = false): Promise<void> {
    if (this.config.notebook && !force) return;
    try {
      await chooseDestination(this);
    } catch (e) {
      if (!(e instanceof Error && e.message === "Cancelled")) throw e;
    }
  }
  choosingSave = false;
  async savePage(view: BrowserView, selection = false) {
    if (this.saving || this.choosingSave) throw Error(this.t("busy"));
    this.choosingSave = true;
    try {
      const article = await view.article(selection);
      try {
        await chooseDestination(this, article.title);
      } catch (e) {
        if (e instanceof Error && e.message === "Cancelled") return;
        throw e;
      }
      if (this.saving) throw Error(this.t("busy"));
      if (view.disposed || view.url !== article.url)
        throw Error(this.t("reopenSource"));
      const job: SaveJob = {
        id: crypto.randomUUID(),
        created: Date.now(),
        article,
        notebook: this.config.notebook,
        parentPath: this.config.databaseTemplateID
          ? "/"
          : await resolveParentPath(this.config),
        databaseID: this.config.databaseID,
        databaseBlockID: this.config.databaseBlockID,
        databaseViewID: this.config.databaseViewID,
        databaseTemplateID: this.config.databaseTemplateID,
        tags: this.config.tags,
        resources: {},
        body: "pending",
        cancelled: false,
      };
      this.jobs.unshift(job);
      await this.saveData("jobs.json", this.jobs);
      await this.executeJob(job, view);
    } finally {
      this.choosingSave = false;
    }
  }
  async executeJob(job: SaveJob, view: BrowserView) {
    if (this.saving) return;
    this.saving = true;
    job.cancelled = false;
    this.showJobs();
    try {
      await runSave(
        job,
        this.adapter.bridge,
        this.adapter.partition,
        view.web.getWebContentsId(),
        async () => {
          await this.saveData("jobs.json", this.jobs);
          this.updateJobs();
        },
      );
      if (job.docId) await openTab({ app: this.app, doc: { id: job.docId } });
    } finally {
      this.saving = false;
      this.updateJobs();
    }
  }
  jobBodies = new Set<HTMLElement>();
  showJobs() {
    const d = dialog(this.t("jobs"));
    this.jobBodies.add(d.body);
    this.updateJobs();
  }
  updateJobs() {
    for (const body of this.jobBodies) {
      if (!body.isConnected) {
        this.jobBodies.delete(body);
        continue;
      }
      body.replaceChildren();
      for (const j of this.jobs) {
        const row = element("div", "sb-job");
        const failed = Object.entries(j.resources).filter(([, r]) => r.error);
        row.append(
          element("strong", "", j.article.title),
          element(
            "p",
            "",
            `${this.t("body")}: ${this.t(j.cancelled ? "cancelled" : j.body)}; ${this.t("resources")}: ${Object.values(j.resources).filter((r) => r.path).length}/${Object.keys(j.resources).length}; MHTML: ${j.snapshot ? "✓" : j.snapshotError || "…"}`,
          ),
        );
        if (j.error) row.append(element("p", "", j.error));
        for (const [url, r] of failed)
          row.append(element("p", "", url + " — " + r.error));
        row.append(
          button(this.t("cancel"), () => {
            j.cancelled = true;
            this.saveData("jobs.json", this.jobs);
          }),
          button(this.t("retry"), () =>
            this.guard(async () => {
              if (!this.active || this.active.url !== j.article.url)
                throw Error(this.t("reopenSource"));
              await this.executeJob(j, this.active);
            }),
          ),
        );
        if (j.docId)
          row.append(
            button(this.t("openDoc"), () =>
              openTab({ app: this.app, doc: { id: j.docId! } }),
            ),
          );
        if (j.snapshot)
          row.append(
            button(this.t("archive"), () =>
              this.guard(() => this.openArchive(j.snapshot!)),
            ),
          );
        body.append(row);
      }
    }
  }
  async saveImage(url: string) {
    const data = await this.adapter.bridge.resource(
      this.adapter.partition,
      url,
    );
    const ext =
      data.mime
        .split(";")[0]
        .split("/")[1]
        ?.replace(/[^a-z0-9]/gi, "") || "bin";
    const path = await upload(
      "web-image-" + crypto.randomUUID() + "." + ext,
      bytes(data.base64),
      data.mime,
    );
    window.require("electron").clipboard.writeText(path);
    showMessage(this.t("imageSaved") + " " + path);
  }
  async prepareArchive(asset: string) {
    if (!/^assets\/web-[\w-]+\.mhtml$/.test(asset))
      throw Error("Invalid archive path");
    const r = await fetch("/" + asset);
    if (!r.ok) throw Error("Archive unavailable");
    const data = new Uint8Array(await r.arrayBuffer());
    let binary = "";
    for (let i = 0; i < data.length; i += 32768)
      binary += String.fromCharCode(...data.subarray(i, i + 32768));
    return this.adapter.bridge.archive(this.adapter.partition, btoa(binary));
  }
  async openArchive(asset: string) {
    if (!/^assets\/web-[\w-]+\.mhtml$/.test(asset))
      throw Error("Invalid archive path");
    await openTab({
      app: this.app,
      custom: {
        id: this.name + "page",
        icon: "iconBrowser",
        title: this.t("archive"),
        data: { archiveAsset: asset, instanceId: crypto.randomUUID() },
      },
      openNewTab: true,
    });
  }
  async onunload() {
    this.closing = true;
    this.favicons.dispose();
    clearTimeout(this.timer);
    for (const j of this.jobs) j.cancelled = true;
    this.eventBus.off("open-link", this.openLink);
    this.eventBus.off("open-menu-link", this.linkMenu);
    for (const v of [...this.views]) v.destroy();
    await Promise.allSettled([
      this.adapter?.close(),
      this.saveData("config.json", this.config),
      this.saveData("jobs.json", this.jobs),
    ]);
    this.libraryRoots.clear();
  }
}
