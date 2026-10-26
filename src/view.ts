import { enhancedClipboard } from "./copy";
import { selectedContent, type CopySelection } from "./copy-selection";
import { addressCandidates, inlineCompletion } from "./omnibox";
import { Menu, openWindow } from "siyuan";
import { setTabFavicon, setTabLoading } from "./tab-icon";
import {
  address,
  clampZoom,
  httpURL,
  HOME_URL,
  INTERNAL_URLS,
  internalPage,
  internalGuestURL,
  internalPageFromGuest,
  migrateInternalURL,
} from "./core";
import { HomePage } from "./home";
import { collectSource, extract, collectSelection, markdown } from "./content";
import type { Article } from "./content";
import {
  articleOutline,
  collectOutlineSource,
  scrollToPageHeading,
  observeOutlineChanges,
  sameOutline,
  type PageHeading,
  type SourceHeading,
} from "./outline";
import { element, button, iconButton, icon } from "./ui";
import type BrowserPlugin from "./index";
/** Shown on the tab before a page reports its own title. */
const UNTITLED = "Browser";
export class BrowserView {
  web: any;
  root: HTMLElement;
  bar = element("input", "b3-text-field sb-address");
  errorPage = element("div", "sb-error");
  status = element("span", "sb-status");
  reader = element("div", "b3-typography sb-reader");
  findbar = element("div", "sb-find");
  findInput = element("input", "b3-text-field");
  hint = element("span", "");
  suggest = element("div", "b3-list sb-suggestions");
  url = "about:blank";
  committedURL = "";
  title = UNTITLED;
  zoom = 1;
  fitWidth = true;
  reading = false;
  outline: PageHeading[] = [];
  outlineLoading = false;
  outlineCurrent?: string;
  outlineEpoch = 0;
  outlineTimer?: ReturnType<typeof setTimeout>;
  outlineRetries = 0;
  outlineArticle?: Article;
  outlineSignature = "";
  outlineSignal = "siyuan-browser-outline-" + crypto.randomUUID();
  loading = false;
  back: HTMLButtonElement;
  forward: HTMLButtonElement;
  reload: HTMLButtonElement;
  bookmarkButton: HTMLButtonElement;
  readingButton: HTMLButtonElement;
  moreButton: HTMLButtonElement;
  moreMenu?: Menu;
  moreOpen = false;
  saveButton: HTMLButtonElement;
  pageMenu = element("div", "sb-page-menu");
  filterOverride?: boolean;
  homePage: HomePage;
  muted = false;
  disposed = false;
  transferring = false;
  suggestionIndex = -1;
  addressEditing = false;
  restoreReading = false;
  faviconEpoch = 0;
  viewportEpoch = 0;
  viewportSignal = "siyuan-browser-layout-" + crypto.randomUUID();
  resizeObserver?: ResizeObserver;
  resizeTimer?: ReturnType<typeof setTimeout>;
  onHostResize = () => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => void this.fitViewport(), 100);
  };
  constructor(
    public plugin: BrowserPlugin,
    public custom: any,
    public data: any,
  ) {
    this.root = custom.element;
    this.root.classList.add("sb-browser");
    setTabFavicon(custom.tab.headElement);
    const p = plugin;
    this.url = migrateInternalURL(data.url || HOME_URL);
    const navigate = (url: string) => {
      this.navigate(url);
      if (!internalPage(this.url)) this.web?.focus();
    };
    this.homePage = new HomePage(p, navigate);
    this.homePage.root.hidden = true;
    this.zoom = clampZoom(data.zoom || 1);
    this.reader.style.fontSize = this.zoom + "em";
    this.fitWidth = data.fitWidth !== false;
    this.muted = !!data.muted;
    this.restoreReading = !!data.reading;
    this.bar.placeholder = p.t("address");
    this.bar.setAttribute("aria-label", p.t("address"));
    const toolbar = element("div", "sb-toolbar");
    this.back = iconButton("back", p.t("back"), () => this.web?.goBack());
    this.forward = iconButton("forward", p.t("forward"), () =>
      this.web?.goForward(),
    );
    this.reload = iconButton("reload", p.t("reload"), () => {
      if (internalPage(this.url)) this.refreshInternalPages();
      else if (this.loading) {
        this.web?.stop();
        this.setLoading(false);
      } else this.retry();
    });
    this.back.disabled = this.forward.disabled = true;
    this.bookmarkButton = iconButton("star", p.t("bookmark"), () =>
      this.toggleBookmark(),
    );
    this.bookmarkButton.setAttribute("aria-pressed", "false");
    this.readingButton = iconButton("iconAlignLeft", p.t("pageOptions"), () =>
      this.showPageMenu(),
    );
    this.saveButton = iconButton("iconDownload", p.t("save"), () =>
      p.guard(() => p.savePage(this)),
    );
    this.moreButton = iconButton("more", p.t("more"), () => this.menu());
    // Marking the trigger as a menu anchor is the host's own contract: its
    // window-level click handler skips dismissal for [data-menu="true"], which
    // is what keeps the second press a toggle instead of a reopen.
    this.moreButton.setAttribute("aria-haspopup", "menu");
    this.moreButton.setAttribute("aria-expanded", "false");
    toolbar.append(
      this.back,
      this.forward,
      this.reload,
      iconButton("iconBrowserHome", p.t("browserHome"), () =>
        this.navigate(HOME_URL),
      ),
      this.readingButton,
      this.bar,
      this.bookmarkButton,
      this.saveButton,
      this.moreButton,
    );
    this.pageMenu.hidden = true;
    this.pageMenu.setAttribute("role", "dialog");
    this.pageMenu.setAttribute("aria-label", p.t("pageOptions"));
    this.pageMenu.tabIndex = -1;
    this.root.addEventListener(
      "pointerdown",
      (e) => {
        if (
          !this.pageMenu.contains(e.target as Node) &&
          !this.readingButton.contains(e.target as Node)
        )
          this.closePageMenu();
      },
      true,
    );
    this.pageMenu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closePageMenu();
        this.readingButton.focus();
      }
    });
    this.pageMenu.addEventListener("focusout", (event) => {
      // On macOS a pointer press may blur the panel without focusing the button.
      // Dismissing that null destination here hides the button before click.
      // Outside pointer presses and Escape are handled separately above.
      const next = event.relatedTarget as Node | null;
      if (!next || next.nodeType !== 1) return;
      queueMicrotask(() => {
        if (
          !this.pageMenu.contains(next) &&
          next !== this.readingButton &&
          !this.pageMenu.contains(document.activeElement) &&
          document.activeElement !== this.readingButton
        )
          this.closePageMenu();
      });
    });
    this.findInput.placeholder = p.t("find");
    this.findInput.addEventListener("input", () => this.find(true));
    this.findInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.find(!e.shiftKey);
      if (e.key === "Escape") this.closeFind();
    });
    this.findbar.append(
      this.findInput,
      this.hint,
      button("↑", () => this.find(false)),
      button("↓", () => this.find(true)),
      button("×", () => this.closeFind()),
    );
    this.findbar.hidden = true;
    this.reader.addEventListener("copy", (event) => {
      const selection = selectedContent(this.reader);
      if (!selection) return;
      try {
        selection.url = this.url;
        const data = enhancedClipboard(selection, window.Lute.New());
        event.clipboardData?.setData("text/plain", data.text);
        event.clipboardData?.setData("text/html", data.html);
        event.clipboardData?.setData("text/siyuan", data.blockDOM);
        event.preventDefault();
        event.stopPropagation();
      } catch {
        /* Keep normal copying available. */
      }
    });
    this.reader.hidden = true;
    this.errorPage.hidden = true;
    this.root.append(
      toolbar,
      this.errorPage,
      this.pageMenu,
      this.suggest,
      this.findbar,
      this.status,
      this.reader,
      this.homePage.root,
    );
    let composingAddress = false;
    let draftAddress = "";
    let suggestionEpoch = 0;
    let suggestionTimer: ReturnType<typeof setTimeout>;
    let candidates: ReturnType<typeof addressCandidates> = [];
    const clearSuggestions = () => {
      suggestionEpoch++;
      clearTimeout(suggestionTimer);
      this.suggestionIndex = -1;
      this.suggest.replaceChildren();
    };
    const submit = (value: string) => {
      if (!value.trim()) return;
      this.addressEditing = false;
      clearSuggestions();
      this.navigate(value);
      if (!internalPage(this.url)) this.web?.focus();
    };
    const paintSuggestions = (remote: string[] = []) => {
      this.suggest.replaceChildren();
      candidates = addressCandidates(p.config, draftAddress, remote);
      for (const entry of candidates) {
        const b = button("", () => submit(entry.value));
        b.classList.add("sb-suggestion");
        const icon = element(
          "span",
          "sb-suggestion-icon",
          entry.kind === "search" ? "⌕" : entry.kind === "bookmark" ? "☆" : "◷",
        );
        const label = element("span", "sb-suggestion-label");
        const highlight = (value: string, cls = "") => {
          const span = element("span", cls);
          const pos = value
            .toLocaleLowerCase()
            .indexOf(draftAddress.toLocaleLowerCase());
          if (pos < 0) span.textContent = value;
          else
            span.append(
              document.createTextNode(value.slice(0, pos)),
              element(
                "strong",
                "",
                value.slice(pos, pos + draftAddress.length),
              ),
              document.createTextNode(value.slice(pos + draftAddress.length)),
            );
          return span;
        };
        label.append(highlight(entry.title));
        if (entry.kind === "search")
          label.append(
            document.createTextNode(
              " — " + p.config.engine + " · " + p.t("search"),
            ),
          );
        else if (entry.url && entry.title !== entry.url)
          label.append(
            document.createTextNode(" — "),
            highlight(entry.url, "sb-suggestion-url"),
          );
        b.append(icon, label);
        if (entry.kind === "history") {
          const remove = element("span", "sb-suggestion-remove", "×");
          remove.title = p.t("delete");
          remove.setAttribute("role", "button");
          remove.setAttribute("aria-label", p.t("delete") + " " + entry.title);
          remove.tabIndex = 0;
          const erase = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            p.config.history = p.config.history.filter(
              (item) => item.url !== entry.value,
            );
            p.persist();
            this.bar.value = draftAddress;
            renderSuggestions();
          };
          remove.addEventListener("click", erase);
          remove.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") erase(e);
          });
          b.append(remove);
        }

        b.dataset.address = entry.kind === "search" ? entry.title : entry.value;
        b.addEventListener("mousedown", (e) => e.preventDefault());
        this.suggest.append(b);
      }
      this.suggestionIndex = candidates.length ? 0 : -1;
      this.suggest.firstElementChild?.classList.add("b3-list-item--focus");
    };
    const renderSuggestions = (complete = false) => {
      clearSuggestions();
      draftAddress = this.bar.value;
      if (!draftAddress.trim() || this.bar.readOnly) return;
      paintSuggestions();
      if (complete) {
        const completion = inlineCompletion(p.config, draftAddress);
        if (completion) {
          this.bar.value = completion;
          this.bar.setSelectionRange(draftAddress.length, completion.length);
          const index = candidates.findIndex(
            (c) =>
              c.value === completion ||
              c.value.replace(/^https?:\/\//i, "") === completion,
          );
          if (index >= 0) {
            this.suggestionIndex = index;
            [...this.suggest.children].forEach((b, i) =>
              b.classList.toggle("b3-list-item--focus", i === index),
            );
          }
        }
      }
      if (/^siyuan-browser:/i.test(draftAddress)) return;
      const epoch = suggestionEpoch;
      suggestionTimer = setTimeout(async () => {
        if (this.disposed || epoch !== suggestionEpoch) return;
        try {
          const terms = await p.adapter.bridge?.searchSuggestions?.(
            p.adapter.partition,
            p.config.engine,
            draftAddress,
          );
          if (
            epoch !== suggestionEpoch ||
            this.disposed ||
            this.suggestionIndex > 0 ||
            !terms?.length
          )
            return;
          paintSuggestions(terms);
        } catch {
          /* Local candidates remain available when the provider is offline. */
        }
      }, 250);
    };
    this.bar.addEventListener("focus", () => {
      this.bar.select();
    });
    this.bar.addEventListener("mousedown", (e) => {
      if (document.activeElement !== this.bar) {
        e.preventDefault();
        this.bar.focus();
        this.bar.select();
      }
    });
    this.bar.addEventListener("compositionstart", () => {
      composingAddress = true;
      this.addressEditing = true;
      clearSuggestions();
    });
    this.bar.addEventListener("compositionend", () => {
      composingAddress = false;
      renderSuggestions();
    });
    this.bar.addEventListener("keydown", (e) => {
      // IME confirmation keys belong to the input method, not navigation.
      // keyCode 229 also covers WebKit's composition-ending Enter event.
      if (composingAddress || e.isComposing || e.keyCode === 229) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!this.suggest.children.length) renderSuggestions();
        const items = [...this.suggest.querySelectorAll("button")];
        if (items.length) {
          this.suggestionIndex =
            (this.suggestionIndex +
              (e.key === "ArrowDown" ? 1 : -1) +
              items.length) %
            items.length;
          items.forEach((b, i) =>
            b.classList.toggle(
              "b3-list-item--focus",
              i === this.suggestionIndex,
            ),
          );
          this.bar.value =
            items[this.suggestionIndex].dataset.address || draftAddress;
          this.addressEditing = true;
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        submit(candidates[this.suggestionIndex]?.value || this.bar.value);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (this.suggest.children.length) {
          this.bar.value = draftAddress;
          clearSuggestions();
        } else {
          this.addressEditing = false;
          this.bar.value = this.addressValue();
          this.bar.select();
        }
      }
    });
    this.bar.addEventListener("input", (e) => {
      this.addressEditing = true;
      if (!composingAddress)
        renderSuggestions(
          (e as InputEvent).inputType === "insertText" &&
            this.bar.selectionStart === this.bar.value.length,
        );
    });
    this.bar.addEventListener("blur", () => {
      composingAddress = false;
      this.addressEditing = false;
      clearSuggestions();
      this.bar.value = this.addressValue();
    });
    this.root.addEventListener("pointerdown", () => (p.active = this));
    if (p.adapter.reason) {
      this.syncPage(this.url);
      if (!internalPage(this.url)) this.showError("host", p.adapter.reason);
      p.active = this;
      return;
    }
    try {
      this.web = p.adapter.create(data.archive);
    } catch (error) {
      this.syncPage(this.url);
      if (!internalPage(this.url)) this.showError("host", String(error));
      p.active = this;
      return;
    }
    this.web.addEventListener("ipc-message", (event: any) => {
      if (event.channel !== "siyuan-browser-copy" || this.disposed) return;
      const selection = event.args?.[0];
      if (
        !selection ||
        typeof selection.html !== "string" ||
        typeof selection.text !== "string" ||
        typeof selection.url !== "string" ||
        selection.html.length > 4 * 1024 * 1024
      )
        return;
      this.copyEnhanced(selection);
    });
    this.web.addEventListener("dom-ready", () => {
      if (this.disposed) return;
      p.viewsByGuest.set(this.web.getWebContentsId(), this);
      this.web.setZoomFactor(this.plugin.adapter.hostZoom() * this.zoom);
      this.web.setAudioMuted(this.muted);
      if (!data.archive && httpURL(this.url)) {
        void this.web
          .executeJavaScript(observeOutlineChanges(this.outlineSignal))
          .catch(() => {});
      }
      if (!data.archive && httpURL(this.url)) {
        void this.web
          .executeJavaScript(
            `(() => {
          let timer;
          const signal = ${JSON.stringify(this.viewportSignal)};
          const changed = () => { clearTimeout(timer); timer = setTimeout(() => console.debug(signal), 350); };
          document.addEventListener('input', changed, true);
          document.addEventListener('click', changed, true);
          document.addEventListener('transitionend', changed, true);
        })()`,
          )
          .catch(() => {});
      }
    });
    this.web.addEventListener("console-message", (e: any) => {
      if (e.message === this.outlineSignal) this.scheduleOutline();
      if (e.message === this.viewportSignal && this.fitWidth)
        void this.fitViewport(false);
    });
    this.web.addEventListener("did-finish-load", () => {
      void this.fitViewport();
      void this.refreshOutline().then((article) => {
        if (article && this.restoreReading && !this.disposed) {
          this.restoreReading = false;
          p.guard(() => this.toggleReader());
        }
      });
    });
    this.web.addEventListener("did-start-navigation", (e: any) => {
      if (e.isMainFrame !== true || e.isInPlace) return;
      this.restoreReading ||= this.reading;
        this.reading = false;
        this.reader.hidden = true;
        if (this.web) this.web.hidden = !!internalPage(this.url);
      this.clearOutline();
    });
    this.web.addEventListener("did-start-loading", () => {
      // Guest loading includes subframes (e.g. login dialogs and ads). Only
      // main-frame navigation invalidates the current document's outline.
      this.clearError();
      this.setLoading(true);
      this.status.textContent = "";
    });
    this.web.addEventListener("did-stop-loading", () => {
      this.setLoading(false);
      if (!this.status.textContent?.startsWith(p.t("failed")))
        this.status.textContent = "";
      this.updateNavigation();
      if (!this.reading) this.scheduleOutline();
    });
    for (const name of ["did-navigate", "did-navigate-in-page"])
      this.web.addEventListener(name, (e: any) => {
        if (e.isMainFrame === false) return;
        if (name === "did-navigate") {
          this.faviconEpoch++;
          setTabFavicon(custom.tab.headElement);
        }
        const page = internalPageFromGuest(e.url);
        const url = page ? INTERNAL_URLS[page] : e.url;
        const changed = this.committedURL !== url;
        const documentChanged =
          changed &&
          (name === "did-navigate" ||
            new URL(this.committedURL || url).pathname !==
              new URL(url).pathname ||
            new URL(this.committedURL || url).search !== new URL(url).search);
        if (documentChanged) {
          this.clearOutline();
          if (this.reading) {
              this.restoreReading = true;
              this.reading = false;
              this.reader.hidden = true;
            }
        }
        this.committedURL = url;
        this.syncPage(url);
        if (name === "did-navigate-in-page" && changed) {
          if (this.restoreReading) {
            this.restoreReading = false;
            p.guard(() => this.toggleReader());
          } else this.scheduleOutline();
        }
        this.updateNavigation();
        this.persist();
        if (httpURL(this.url) && (name === "did-navigate" || changed)) {
          if (name === "did-navigate") this.title = this.url;
          custom.tab.updateTitle(this.title);
          p.visit(this.url, this.title);
        }
      });
    this.web.addEventListener("page-title-updated", (e: any) => {
      if (internalPage(this.url)) return;
      this.title = e.title || this.url;
      custom.tab.updateTitle(this.title);
      this.persist();
      p.updateTitle(this.url, this.title);
    });
    this.web.addEventListener("page-favicon-updated", (e: any) => {
      const url = e.favicons?.find(httpURL);
      if (url && !internalPage(this.url)) {
        const epoch = ++this.faviconEpoch;
        p.guard(async () => {
          const src = await p.favicons.get(url);
          if (src && !this.disposed && epoch === this.faviconEpoch) {
            setTabFavicon(custom.tab.headElement, src);
            p.updateFavicon(this.url, url);
          }
        });
      }
    });
    this.web.addEventListener("did-fail-load", (e: any) => {
      if (
        !internalPage(this.url) &&
        e.errorCode !== -3 &&
        e.isMainFrame !== false
      ) {
        this.setLoading(false);
        this.showError(String(e.errorCode), e.errorDescription, e.validatedURL);
      }
    });
    this.web.addEventListener("render-process-gone", (e: any) =>
      this.showError("crash", e.reason),
    );
    this.web.addEventListener("unresponsive", () =>
      this.showError("unresponsive", ""),
    );
    this.web.addEventListener("responsive", () => this.clearError());
    this.web.addEventListener(
      "found-in-page",
      (e: any) =>
        (this.hint.textContent =
          e.result.activeMatchOrdinal + " / " + e.result.matches),
    );
    this.bar.value = this.addressValue();
    this.bar.readOnly = !!data.archive;
    if (!data.archive) this.navigate(this.url);
    this.root.append(this.web);
    this.resizeObserver = new ResizeObserver(this.onHostResize);
    this.resizeObserver.observe(this.web);
    window.addEventListener("resize", this.onHostResize);
    p.active = this;
  }
  clearError() {
    this.errorPage.hidden = true;
    if (this.web) this.web.hidden = !!internalPage(this.url) || this.reading;
  }
  retry() {
    this.clearError();
    if (internalPage(this.url)) this.syncPage(this.url);
    else if (this.web) this.web.reload();
    else this.showError("host", this.plugin.adapter.reason);
  }
  showError(code: string, detail = "", url = this.url) {
    this.clearOutline();
    const p = this.plugin;
    const kind =
      code === "host"
        ? "host"
        : code === "crash" || code === "unresponsive"
          ? "crash"
          : code === "address"
            ? "address"
            : /CERT|SSL/.test(detail)
              ? "certificate"
              : code === "-106"
                ? "offline"
                : code === "-105"
                  ? "dns"
                  : code === "-7" || code === "-118"
                    ? "timeout"
                    : "network";
    this.setLoading(false);
    this.status.textContent = "";
    this.reader.hidden = true;
    this.homePage.root.hidden = true;
    this.reading = false;
    this.closePageMenu();
    if (this.web) this.web.hidden = true;
    this.errorPage.hidden = false;
    const card = element("div", "sb-error-card");
    const actions = element("div", "sb-error-actions");
    actions.append(
      button(p.t("retry"), () => this.retry()),
      button(p.t("browserHome"), () => this.navigate(HOME_URL)),
    );
    if (httpURL(url))
      actions.append(button(p.t("external"), () => p.adapter.external(url)));
    card.append(
      icon("iconBrowserHome"),
      element("h2", "", p.t("error_" + kind)),
      element("p", "", p.t("errorHint_" + kind)),
      element("div", "sb-error-url", url),
      actions,
    );
    const details = element("details");
    details.append(
      element("summary", "", p.t("errorDetails")),
      element("pre", "", code + (detail ? " · " + detail : "")),
    );
    card.append(details);
    this.errorPage.replaceChildren(card);
  }
  addressValue() {
    return this.data.archive
      ? this.plugin.t("archive")
      : this.url === HOME_URL
        ? ""
        : this.url;
  }
  updateNavigation() {
    try {
      this.back.disabled = !this.web.canGoBack();
      this.forward.disabled = !this.web.canGoForward();
    } catch {
      /* Navigation can precede the first guest dom-ready event. */
    }
  }
  setLoading(loading: boolean) {
    if (this.disposed) return;
    this.loading = loading && !internalPage(this.url);
    this.reload.replaceChildren(icon(this.loading ? "stop" : "reload"));
    this.reload.setAttribute(
      "aria-label",
      this.plugin.t(this.loading ? "stopLoading" : "reload"),
    );
    setTabLoading(
      this.custom.tab.headElement,
      this.loading,
      this.plugin.t("loading"),
    );
  }
  syncPage(url: string) {
    this.clearError();
    this.url = url;
    const page = !this.data.archive ? internalPage(url) : undefined;
    this.homePage.root.hidden = page !== "home";
    this.bookmarkButton.disabled = !httpURL(url) || !!this.data.archive;
    this.refreshBookmark();
    this.saveButton.disabled = !httpURL(url) || !!this.data.archive;
    this.readingButton.disabled = !httpURL(url) && !this.data.archive;
    this.closePageMenu();
    if (this.web) this.web.hidden = !!page || this.reading;
    if (!this.addressEditing) this.bar.value = this.addressValue();
    if (page) {
      this.clearOutline();
      this.setLoading(false);
      this.restoreReading = false;
      this.reading = false;
      this.reader.hidden = true;
      this.closeFind();
      this.status.textContent = "";
      this.title = this.plugin.t("browserHome");
      this.custom.tab.updateTitle?.(this.title);
      this.faviconEpoch++;
      setTabFavicon(this.custom.tab.headElement);
      this.refreshInternalPages();
    }
  }
  /** Bookmark names follow the page title, like a browser: the live guest title
   * first, then the title the tab already shows, then the host name. */
  bookmarkTitle(url: string) {
    const webTitle = String(this.web?.getTitle?.() || "").trim();
    if (webTitle && webTitle !== url) return webTitle;
    const title = this.title.trim();
    if (title && title !== url && title !== UNTITLED) return title;
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
  /** Saved entries keep their own URL form, which may differ by a trailing slash. */
  savedBookmark() {
    const key = (url: string) => url.replace(/\/$/, "");
    return this.plugin.config.bookmarks.find(
      (entry) => key(entry.url) === key(this.url),
    );
  }
  /** The star mirrors whether the current URL is already saved, like a browser. */
  refreshBookmark() {
    const saved =
      !this.data.archive && httpURL(this.url) && !!this.savedBookmark();
    const label = this.plugin.t(saved ? "removeBookmark" : "bookmark");
    this.bookmarkButton.setAttribute("aria-pressed", String(saved));
    this.bookmarkButton.title = label;
    this.bookmarkButton.setAttribute("aria-label", label);
  }
  toggleBookmark() {
    const p = this.plugin;
    if (!httpURL(this.url) || this.data.archive) return;
    const saved = this.savedBookmark();
    if (saved) p.removeEntry("bookmarks", saved.url);
    else p.bookmark(this.url, this.bookmarkTitle(this.url));
    this.refreshBookmark();
  }
  refreshInternalPages() {
    if (!this.homePage.root.hidden) this.homePage.refresh();
  }
  persist() {
    if (this.data.archive) return;
    Object.assign(this.custom.data, {
      url: this.url,
      zoom: this.zoom,
      fitWidth: this.fitWidth,
      muted: this.muted,
      reading: this.reading,
    });
    this.plugin.persist();
  }
  navigate(input: string) {
    try {
      const url = address(input, this.plugin.searchTemplate());
      if (this.data.archive) {
        this.plugin.open(url);
        return;
      }
      this.addressEditing = false;
        this.clearOutline();
        this.reading = false;
        this.reader.hidden = true;
      this.closeFind();
      this.syncPage(url);
      if (this.web) this.web.src = internalGuestURL(url) || url;
      else if (!internalPage(url)) this.plugin.adapter.external(url);
      this.persist();
    } catch (e) {
      this.showError("address", String(e));
    }
  }
  copyEnhanced(selection: CopySelection) {
    const clipboard = window.require("electron").clipboard;
    try {
      const data = enhancedClipboard(selection, window.Lute.New());
      clipboard.write({ text: data.text, html: data.html });
    } catch {
      clipboard.writeText(selection.text);
    }
  }
  async article(selection = false) {
    if (this.data.archive || !httpURL(this.url))
      throw Error("Open an HTTP(S) page before saving");
    const s = await this.web.executeJavaScript(collectSource);
    if (selection && this.reading) {
      const selected = getSelection();
      if (!selected?.rangeCount || !this.reader.contains(selected.anchorNode))
        throw Error("No selection");
      const fragment = document.createElement("div");
      fragment.append(selected.getRangeAt(0).cloneContents());
      return extract(fragment.innerHTML, s.url, s.title, true);
    }
    if (selection) {
      s.html = await this.web.executeJavaScript(collectSelection);
      if (!s.html) throw Error("No selection");
    }
    return extract(s.html, s.url, s.title, selection);
  }
  async toggleReader() {
      if (this.reading) {
        this.reading = false;
        this.reader.hidden = true;
      this.web.hidden = false;
      this.persist();
      this.scheduleOutline();
      return;
    }
    const article = this.outlineArticle || (await this.refreshOutline());
    if (!article || this.disposed) return;
    const epoch = this.outlineEpoch;
    this.reader.replaceChildren();
    const html = window.Lute.New().Md2HTML(markdown(article.html, article.url));
    const { default: purify } = await import("dompurify");
    if (this.disposed || epoch !== this.outlineEpoch) return;
    const parsed = new DOMParser().parseFromString(
      purify.sanitize(html),
      "text/html",
    );
    for (const img of parsed.images) {
      img.dataset.source = img.getAttribute("src") || "";
      img.removeAttribute("src");
      img.removeAttribute("srcset");
    }
    this.reader.innerHTML = purify.sanitize(parsed.body.innerHTML, {
      FORBID_TAGS: ["iframe", "object", "embed", "style", "script"],
    });
    this.reader.prepend(element("h1", "", article.title));
    for (const img of this.reader.querySelectorAll("img")) {
      const url = img.dataset.source || "";
      img.removeAttribute("src");
      if (httpURL(url))
        this.plugin.guard(async () => {
          const r = await this.plugin.adapter.bridge.resource(
            this.plugin.adapter.partition,
            url,
          );
          if (/^image\//.test(r.mime) && !r.mime.includes("svg"))
            img.src = "data:" + r.mime + ";base64," + r.base64;
        });
    }
    this.reader.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (httpURL(a.href)) this.plugin.open(a.href);
      }),
    );
      this.reading = true;
      this.web.hidden = true;
    this.reader.hidden = false;
    this.persist();
  }
  clearOutline() {
    this.outlineEpoch++;
    clearTimeout(this.outlineTimer);
    this.outline = [];
    this.outlineArticle = undefined;
    this.outlineSignature = "";
    this.outlineCurrent = undefined;
    this.outlineLoading = false;
    this.outlineRetries = 0;
    this.plugin.outline?.schedule();
  }
  scheduleOutline(retry = false) {
    if (this.reading) return;
    if (!retry) this.outlineRetries = 0;
    clearTimeout(this.outlineTimer);
    this.outlineTimer = setTimeout(
      () => {
        if (!this.reading) void this.refreshOutline();
      },
      retry ? 750 : 250,
    );
  }
  async refreshOutline(): Promise<Article | undefined> {
    if (
      this.disposed ||
      !this.web ||
      internalPage(this.url) ||
      this.data.archive ||
      !httpURL(this.url)
    )
      return;
    clearTimeout(this.outlineTimer);
    const epoch = ++this.outlineEpoch;
    this.outlineLoading = !this.outline.length;
    this.plugin.outline?.schedule();
    try {
      const source = await this.web.executeJavaScript(
        collectOutlineSource(this.outlineSignature),
      );
      if (
        epoch !== this.outlineEpoch ||
        this.disposed ||
        source.url !== this.url
      )
        return;
      if (source.unchanged) {
        // The page only changed cosmetics: the cached article still applies.
        this.outlineRetries = 0;
        return this.outlineArticle;
      }
      if (source.transient && this.outlineArticle) return this.outlineArticle;
      const article = extract(source.html, source.url, source.title);
      const next = articleOutline(article, source.headings);
      const previousStillPresent = this.outline.some(
        (entry) =>
          entry.readerIndex >= 0 &&
          source.headings.some(
            (heading: SourceHeading) =>
              heading.key === entry.target?.key ||
              (heading.id &&
                heading.id === entry.target?.id &&
                heading.text === entry.target?.text),
          ),
      );
      if (
        this.outlineArticle &&
        (article.fallback || (next.length <= 1 && previousStillPresent))
      ) {
        this.retryOutline();
        return this.outlineArticle;
      }
      this.outlineArticle = article;
      // Only a snapshot we actually adopted may suppress the next one.
      this.outlineSignature = source.signature || "";
      this.outlineRetries = 0;
      if (!sameOutline(this.outline, next)) this.outline = next;
      if (!this.outline.some((entry) => entry.key === this.outlineCurrent))
        this.outlineCurrent = undefined;
      return article;
    } catch {
      if (epoch === this.outlineEpoch) {
        this.retryOutline();
        return this.outlineArticle;
      }
    } finally {
      if (epoch === this.outlineEpoch) {
        this.outlineLoading = false;
        this.plugin.outline?.schedule();
      }
    }
  }
  retryOutline() {
    if (this.outlineRetries++ < 2) this.scheduleOutline(true);
  }
  async jumpToHeading(entry: PageHeading) {
    if (this.disposed || !this.outline.includes(entry)) return;
    if (this.reading) {
      const headings =
        this.reader.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6");
      const target = headings[entry.readerIndex + 1];
      target?.scrollIntoView({ block: "start" });
    } else {
      const found = await this.web.executeJavaScript(
        scrollToPageHeading(entry),
      );
      if (!found) {
        await this.refreshOutline();
        return;
      }
    }
    this.outlineCurrent = entry.key;
    this.plugin.outline?.schedule();
  }
  showFind() {
    if (internalPage(this.url)) {
      this.homePage.search.focus();
      return;
    }
    this.findbar.hidden = false;
    this.findInput.focus();
  }
  closeFind() {
    const wasOpen = !this.findbar.hidden;
    this.findbar.hidden = true;
    if (this.reading)
      this.reader
        .querySelectorAll("mark")
        .forEach((m) => m.replaceWith(...m.childNodes));
    else if (wasOpen) {
      try {
        this.web?.stopFindInPage("clearSelection");
      } catch {
        /* A navigating or newly mounted guest may not be ready. */
      }
    }
  }
  find(forward: boolean) {
    const text = this.findInput.value;
    if (!text) return;
    if (!this.reading) {
      this.web.findInPage(text, { forward, findNext: true });
      return;
    }
    const existing = this.reader.querySelectorAll("mark");
    existing.forEach((m) => m.replaceWith(...m.childNodes));
    this.reader.normalize();
    const walker = document.createTreeWalker(this.reader, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const n of nodes) {
      const value = n.data;
      let from = 0,
        index = value.toLocaleLowerCase().indexOf(text.toLocaleLowerCase());
      if (index < 0) continue;
      const frag = document.createDocumentFragment();
      while (index >= 0) {
        frag.append(
          value.slice(from, index),
          element("mark", "", value.slice(index, index + text.length)),
        );
        from = index + text.length;
        index = value
          .toLocaleLowerCase()
          .indexOf(text.toLocaleLowerCase(), from);
      }
      frag.append(value.slice(from));
      n.replaceWith(frag);
    }
    const marks = this.reader.querySelectorAll("mark");
    const current = Number(this.findInput.dataset.index || "-1");
    const index = (current + (forward ? 1 : -1) + marks.length) % marks.length;
    this.findInput.dataset.index = String(index);
    marks[index]?.scrollIntoView({ block: "center" });
    this.hint.textContent =
      (marks.length ? index + 1 : 0) + " / " + marks.length;
  }
  async fitViewport(reset = true) {
    if (this.disposed || !this.web || this.web.hidden || !this.web.clientWidth)
      return;
    const epoch = ++this.viewportEpoch;
    try {
      // Menu zoom is a multiplier relative to the current SiYuan UI zoom.
      if (reset)
        this.web.setZoomFactor(this.plugin.adapter.hostZoom() * this.zoom);
      if (this.data.archive || !this.fitWidth) return;
      const currentZoom = this.web.getZoomFactor();
      // Desktop sites may enforce a minimum width larger than a split pane.
      // Measure at the requested zoom, then fit the whole document rather than
      // clipping its right edge. No guest styles or page content are rewritten.
      const size = await this.web.executeJavaScript(
        `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve({width:innerWidth, content:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)}))))`,
      );
      if (this.disposed || epoch !== this.viewportEpoch) return;
      if (size.width > 0 && size.content > size.width + 2)
        this.web.setZoomFactor(
          Math.max(0.25, (currentZoom * size.width) / size.content),
        );
    } catch {
      /* The guest may not be ready or may have navigated. */
    }
  }
  setZoom(n: number) {
    this.zoom = clampZoom(n);
    this.fitWidth = false;
    void this.fitViewport();
    this.reader.style.fontSize = this.zoom + "em";
    this.persist();
  }
  closePageMenu() {
    this.pageMenu.hidden = true;
    this.readingButton.setAttribute("aria-expanded", "false");
  }
  showPageMenu() {
    if (!this.pageMenu.hidden) {
      this.closePageMenu();
      return;
    }
    this.closeMore();
    const p = this.plugin;
    const render = () => {
      this.pageMenu.replaceChildren();
      const reader = button(
        p.t(this.reading ? "hideReader" : "showReader"),
        () =>
          p.guard(async () => {
            reader.disabled = true;
            try {
              await this.toggleReader();
              render();
            } finally {
              reader.disabled = false;
            }
          }),
      );
      reader.classList.add("sb-reader-toggle");
      this.pageMenu.append(reader);
      if (this.reading) {
        const themes = element("div", "sb-reader-themes");
        for (const [name, bg, fg] of [
          ["white", "#fff", "#222"],
          ["sepia", "#f8f0df", "#433422"],
          ["gray", "#454648", "#eee"],
          ["black", "#151515", "#eee"],
        ]) {
          const b = button("", () => {
            this.reader.style.background = bg;
            this.reader.style.color = fg;
          });
          b.style.background = bg;
          b.setAttribute("aria-label", p.t("theme" + name));
          themes.append(b);
        }
        const font = element("select", "b3-select");
        for (const [label, family] of [
          ["sansFont", "system-ui, sans-serif"],
          ["serifFont", '"Songti SC", serif'],
          ["kaiFont", '"Kaiti SC", serif'],
          ["roundFont", '"Yuanti SC", sans-serif'],
        ])
          font.add(new Option(p.t(label), family));
        font.value = this.reader.style.fontFamily || "system-ui, sans-serif";
        font.onchange = () => {
          this.reader.style.fontFamily = font.value;
        };
        font.setAttribute("aria-label", p.t("readerFont"));
        this.pageMenu.append(themes, font);
      }
      const zoom = element("div", "sb-page-zoom");
      const level = button(
        Math.round(this.zoom * 100) + "%",
        () => {
          this.setZoom(1);
          render();
        },
        p.t("zoomReset"),
      );
      zoom.append(
        element("span", "", p.t("zoom")),
        button(
          "−",
          () => {
            this.setZoom(this.zoom - 0.1);
            render();
          },
          p.t("zoomOut"),
        ),
        level,
        button(
          "+",
          () => {
            this.setZoom(this.zoom + 0.1);
            render();
          },
          p.t("zoomIn"),
        ),
      );
      this.pageMenu.append(
        zoom,
        button(p.t("fitWidth"), () => {
          this.fitWidth = true;
          void this.fitViewport();
          this.persist();
          this.closePageMenu();
        }),
        button(p.t("find"), () => {
          this.closePageMenu();
          this.showFind();
        }),
      );
      if (!this.data.archive) {
        const enabled = this.filterOverride ?? p.config.adblock;
        this.pageMenu.append(
          button(p.t(enabled ? "pausePageFilter" : "enablePageFilter"), () =>
            p.guard(async () => {
              p.adapter.bridge.setPageFiltering(
                p.adapter.partition,
                this.web.getWebContentsId(),
                !enabled,
              );
              this.filterOverride = !enabled;
              this.closePageMenu();
              if (this.reading) await this.toggleReader();
              this.web.reload();
            }),
          ),
        );
      }
      if (!this.pageMenu.hidden) this.pageMenu.focus();
    };
    render();
    this.pageMenu.hidden = false;
    this.readingButton.setAttribute("aria-expanded", "true");
    const rect = this.readingButton.getBoundingClientRect(),
      root = this.root.getBoundingClientRect();
    // Keep the panel inside the tab body, mirroring the 3.8.8 menu anchoring.
    const top = rect.bottom - root.top + 8;
    const bottom = root.height - this.pageMenu.offsetHeight - 8;
    this.pageMenu.style.left =
      Math.max(6, Math.min(rect.left - root.left, root.width - 294)) + "px";
    this.pageMenu.style.top = Math.max(6, Math.min(top, bottom)) + "px";
    this.pageMenu.focus();
  }
  /** Forgets the menu; the host already removed it. */
  resetMore() {
    this.moreMenu = undefined;
    this.moreOpen = false;
    this.moreButton.setAttribute("aria-expanded", "false");
    this.moreButton.removeAttribute("data-menu");
  }
  closeMore() {
    const menu = this.moreMenu;
    // Clearing moreMenu first makes the host close callback a no-op. The SDK
    // only reports isOpen for menus built with a matching id, so the element's
    // own visibility is the signal that something is still on screen.
    this.resetMore();
    if (menu && !menu.element.classList.contains("fn__none")) menu.close();
  }
  menu() {
    const p = this.plugin;
    // Same contract as the reader panel: press once to open, press again to
    // dismiss.
    if (this.moreOpen) {
      this.closeMore();
      return;
    }
    this.closePageMenu();
    const m = new Menu(undefined, () => {
      if (this.moreMenu === m) this.resetMore();
    });
    const add = (label: string, fn: () => void) =>
      m.addItem({ label, click: fn });
    add(p.t("browserHome"), () => this.navigate(HOME_URL));
    if (p.config.recentlyClosed?.[0])
      add(p.t("reopenClosed"), () =>
        p.guard(() => p.reopen(p.config.recentlyClosed[0])),
      );
    if (httpURL(this.url) || this.data.archive) {
      add(p.t("external"), () => p.adapter.external(this.url));
    }
    if (this.web)
      add(this.muted ? p.t("unmute") : p.t("mute"), () => {
        this.muted = !this.muted;
        p.adapter.bridge.action(
          p.adapter.partition,
          this.web.getWebContentsId(),
          "setAudioMuted",
          this.muted,
        );
        this.persist();
      });
    m.addSeparator();
    add(p.t("right"), () => p.open(this.url, "right"));
    add(p.t("bottom"), () => p.open(this.url, "bottom"));
    add(p.t("window"), () => {
      this.transferring = true;
      openWindow({ tab: this.custom.tab });
    });
    add(p.t("settings"), () => p.openSetting());
    this.moreMenu = m;
    this.moreOpen = true;
    this.moreButton.setAttribute("aria-expanded", "true");
    this.moreButton.setAttribute("data-menu", "true");
    const rect = this.moreButton.getBoundingClientRect();
    m.open({
      x: Math.max(6, Math.min(rect.left, window.innerWidth - 220)),
      y: rect.bottom,
    });
  }
  destroy() {
    this.clearOutline();
    if (this.disposed) return;
    this.disposed = true;
    this.closeMore();
    this.viewportEpoch++;
    this.faviconEpoch++;
    clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.onHostResize);
    setTabLoading(this.custom.tab.headElement, false);
    setTabFavicon(this.custom.tab.headElement);
    try {
      this.plugin.viewsByGuest.delete(this.web?.getWebContentsId());
    } catch {}
    this.web?.remove();
    this.root.replaceChildren();
    this.plugin.views.delete(this);
    this.plugin.refreshDocks();
    if (
      !this.plugin.closing &&
      !this.transferring &&
      !this.data.archive &&
      httpURL(this.url)
    )
      this.plugin.closed(this.url, this.title);
    if (this.plugin.active === this) this.plugin.active = undefined;
  }
}
