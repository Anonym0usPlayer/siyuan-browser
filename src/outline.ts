import type { Article } from "./content";

export interface SourceHeading {
  key: string;
  id: string;
  text: string;
  level: number;
}
export interface PageHeading {
  key: string;
  text: string;
  level: number;
  readerIndex: number;
  target?: SourceHeading;
}
export const headingText = (text: string) =>
  text
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const transientUI =
  'dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"]';

/** Observe content and visibility changes, including modal dismissal without
 * heading insertion/removal. Exclude our target attributes to avoid a loop. */
export function observeOutlineChanges(signal: string): string {
  return `(() => {
    const slot=Symbol.for('siyuan-browser-outline-observer');
    window[slot]?.disconnect();
    let timer;
    const changed=()=>{clearTimeout(timer);timer=setTimeout(()=>console.debug(${JSON.stringify(signal)}),500);};
    const headings='h1,h2,h3,h4,h5,h6';
    const content='article,main,[role="main"],'+headings;
    const modal=${JSON.stringify(transientUI)};
    const relevant=node=>node.nodeType===1 && (node.matches(content+','+modal+',iframe') || node.querySelector(headings+','+modal+',iframe'));
    const observer=new MutationObserver(records=>{
      if(records.some(r=>{
        const el=r.target.nodeType===1?r.target:r.target.parentElement;
        if(!el) return false;
        if(r.type==='attributes') return el.matches('html,body,'+content+','+modal) || el.closest(content+','+modal) || el.querySelector(headings+','+modal);
        return el.closest(content+','+modal) || [...r.addedNodes,...r.removedNodes].some(relevant);
      })) changed();
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,
      attributeFilter:['class','style','hidden','open','aria-hidden','aria-busy','aria-modal','role']});
    window[slot]={disconnect:()=>{clearTimeout(timer);observer.disconnect();}};
  })()`;
}

export function sameOutline(a: PageHeading[], b: PageHeading[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, index) => {
      const next = b[index];
      return (
        entry.key === next.key &&
        entry.text === next.text &&
        entry.level === next.level &&
        entry.readerIndex === next.readerIndex &&
        entry.target?.key === next.target?.key &&
        entry.target?.id === next.target?.id &&
        entry.target?.text === next.target?.text
      );
    })
  );
}

/** Match only headings retained by the reader extractor, in document order. */
export function articleOutline(
  article: Article,
  source: SourceHeading[],
): PageHeading[] {
  const doc = new DOMParser().parseFromString(article.html, "text/html");
  const used = new Set<string>();
  const match = (el: Element) => {
    const text = headingText(el.textContent || "");
    const key = el.getAttribute("data-sb-outline-target");
    const target =
      source.find((h) => !used.has(h.key) && h.key === key) ||
      source.find(
        (h) => !used.has(h.key) && el.id && h.id === el.id && h.text === text,
      ) ||
      source.find((h) => !used.has(h.key) && h.text === text);
    if (target) used.add(target.key);
    return target;
  };
  const title = source.find(
    (h) =>
      h.level === 1 &&
      (h.text === headingText(article.title) ||
        headingText(article.title).startsWith(h.text + " - ")),
  );
  // Defuddle can keep the original title as well as returning it in metadata.
  const headings = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  const entries: PageHeading[] = [
    {
      key: "title",
      text: article.title,
      level: 1,
      readerIndex: -1,
      target: title,
    },
  ];
  headings.forEach((el, readerIndex) => {
    const text = headingText(el.textContent || "");
    const target = match(el);
    if (!text || (readerIndex === 0 && text === headingText(article.title)))
      return;
    entries.push({
      key: target?.key || `heading-${readerIndex}`,
      text,
      level: Number(el.tagName[1]),
      readerIndex,
      target,
    });
  });
  return entries;
}

export const collectOutlineSource = `(() => {
  const normalize = text => text.replace(/[\\u200b-\\u200d\\ufeff]/g,'').replace(/\\s+/g,' ').trim();
  const modal=${JSON.stringify(transientUI)};
  const transient=[...document.querySelectorAll(modal)].some(el=>{
    const style=getComputedStyle(el);
    return el.getClientRects().length && style.display!=='none' && style.visibility!=='hidden';
  });
  const slot=Symbol.for('siyuan-browser-outline-targets');
  const targets=window[slot] ||= {next:0,elements:new WeakMap()};
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(el=>!el.closest(modal)).map(el => {
    let key=targets.elements.get(el);
    if(!key){key='source-heading-'+targets.next++;targets.elements.set(el,key);}
    el.setAttribute('data-sb-outline-target',key);
    return {key,id:el.id,text:normalize(el.textContent||''),level:Number(el.tagName[1])};
  });
  const doc=document.documentElement.cloneNode(true);
  const live=[...document.images],copy=[...doc.querySelectorAll('img')];
  copy.forEach((e,i)=>{if(live[i]?.currentSrc)e.setAttribute('src',live[i].currentSrc)});
  doc.querySelectorAll(modal).forEach(el=>el.remove());
  return {html:doc.outerHTML,title:document.title,url:location.href,headings,transient};
})()`;

export function scrollToPageHeading(entry: PageHeading): string {
  return `(() => {
    const entry=${JSON.stringify(entry)};
    const normalize=text=>text.replace(/[\\u200b-\\u200d\\ufeff]/g,'').replace(/\\s+/g,' ').trim();
    const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    const target=entry.target;
    const el=target && (headings.find(h=>h.getAttribute('data-sb-outline-target')===target.key && normalize(h.textContent||'')===target.text)
      || headings.find(h=>target.id && h.id===target.id && normalize(h.textContent||'')===target.text)
      || headings.find(h=>normalize(h.textContent||'')===target.text));
    if(el){
      el.scrollIntoView({block:'start',behavior:'instant'});
      const rect=el.getBoundingClientRect();
      const x=Math.max(1,Math.min(innerWidth-1,rect.left+rect.width/2));
      let covered=0;
      for(const hit of document.elementsFromPoint?.(x,1)||[]){
        for(let node=hit;node && node!==document.body;node=node.parentElement){
          const style=getComputedStyle(node), box=node.getBoundingClientRect();
          if((style.position==='fixed'||style.position==='sticky') && box.top<=1 && box.bottom>0 && box.bottom<innerHeight/2)
            covered=Math.max(covered,box.bottom);
        }
      }
      const offset=covered ? Math.max(0,covered+12-rect.top) : 0;
      if(offset){
        let container=el.parentElement;
        while(container && container!==document.body && container!==document.documentElement){
          if(/auto|scroll/.test(getComputedStyle(container).overflowY) && container.scrollHeight>container.clientHeight) break;
          container=container.parentElement;
        }
        if(container && container!==document.body && container!==document.documentElement) container.scrollBy({top:-offset,behavior:'instant'});
        else window.scrollBy({top:-offset,behavior:'instant'});
      }
      return true;
    }
    if(entry.key==='title'){window.scrollTo({top:0,behavior:'instant'});return true;}
    return false;
  })()`;
}

export interface OutlineView {
  disposed: boolean;
  custom: any;
  outline: PageHeading[];
  outlineLoading: boolean;
  outlineCurrent?: string;
  jumpToHeading(entry: PageHeading): Promise<void>;
}

/** Add a reversible browser tree to the host's existing global outline dock.
 * Native note trees and document-local outlines stay owned by SiYuan. */
export class BrowserOutline {
  private panels = new Map<
    HTMLElement,
    {
      root: HTMLElement;
      view?: OutlineView;
      entries?: PageHeading[];
      loading?: boolean;
    }
  >();
  private observer: MutationObserver;
  private queued = false;
  private closed = false;
  constructor(
    private views: () => Iterable<OutlineView>,
    private docks: () => HTMLElement[],
    private empty: string,
    private loading: string,
    private guard: (fn: () => Promise<void>) => void,
  ) {
    this.observer = new MutationObserver((records) => {
      if (
        records.some((r) => {
          const el = r.target as Element;
          if (el.closest?.(".sb-outline")) return false;
          return (
            (r.type === "childList" &&
              (el === document.body ||
                !!el.closest?.(
                  ".layout__dockl,.layout__dockr,.layout-tab-container",
                ))) ||
            (r.type === "attributes" &&
              el.matches?.(".layout__wnd,[data-type=tab-header],.sy__outline"))
          );
        })
      )
        this.schedule();
    });
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    document.addEventListener("pointerdown", this.schedule, true);
    this.schedule();
  }
  schedule = () => {
    if (this.closed || this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (!this.closed) this.refresh();
    });
  };
  refresh() {
    const selected =
      document.querySelector(
        ".layout__wnd--active .layout-tab-bar .item--focus",
      ) || document.querySelector(".layout-tab-bar .item--focus");
    const view = [...this.views()].find(
      (v) => !v.disposed && v.custom.tab.headElement === selected,
    );
    const docks = new Set(this.docks());
    for (const [panel, state] of this.panels) {
      if (!docks.has(panel) || !view) {
        state.root.remove();
        panel.classList.remove("sb-outline-host");
        this.panels.delete(panel);
      }
    }
    if (!view) return;
    for (const panel of docks) {
      let state = this.panels.get(panel);
      if (!state) {
        const root = document.createElement("div");
        root.className = "sb-outline fn__flex-1";
        panel.append(root);
        panel.classList.add("sb-outline-host");
        state = { root };
        this.panels.set(panel, state);
      }
      if (
        state.view !== view ||
        state.entries !== view.outline ||
        state.loading !== view.outlineLoading
      ) {
        state.root.replaceChildren();
        const list = document.createElement("ul");
        list.className = "b3-list b3-list--background";
        list.setAttribute("role", "tree");
        const stack: { level: number; list: HTMLElement }[] = [
          { level: 0, list },
        ];
        view.outline.forEach((entry, index) => {
          while (stack.length > 1 && stack.at(-1)!.level >= entry.level)
            stack.pop();
          const li = document.createElement("li");
          li.className = "b3-list-item";
          li.dataset.outlineKey = entry.key;
          li.setAttribute("role", "treeitem");
          li.tabIndex = 0;
          const text = document.createElement("span");
          text.className = "b3-list-item__text";
          text.textContent = entry.text;
          li.title = entry.text;
          const childList = document.createElement("ul");
          childList.className = "b3-list";
          childList.setAttribute("role", "group");
          const hasChildren = view.outline[index + 1]?.level > entry.level;
          const toggle = document.createElement("span");
          toggle.className = "b3-list-item__toggle";
          if (hasChildren) {
            li.setAttribute("aria-expanded", "true");
            toggle.innerHTML =
              '<svg class="b3-list-item__arrow b3-list-item__arrow--open"><use href="#iconRight"></use></svg>';
            toggle.addEventListener("click", (e) => {
              e.stopPropagation();
              childList.hidden = !childList.hidden;
              li.setAttribute("aria-expanded", String(!childList.hidden));
              toggle.firstElementChild?.classList.toggle(
                "b3-list-item__arrow--open",
                !childList.hidden,
              );
            });
          } else toggle.classList.add("fn__hidden");
          li.style.paddingLeft = `${8 + (stack.length - 1) * 16}px`;
          li.append(toggle, text);
          const jump = () => this.guard(() => view.jumpToHeading(entry));
          li.addEventListener("click", jump);
          li.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              jump();
            }
          });
          stack.at(-1)!.list.append(li, childList);
          stack.push({ level: entry.level, list: childList });
        });
        if (!view.outline.length) {
          const li = document.createElement("li");
          li.className = "b3-list--empty";
          li.textContent = view.outlineLoading ? this.loading : this.empty;
          list.append(li);
        }
        state.root.append(list);
        state.view = view;
        state.entries = view.outline;
        state.loading = view.outlineLoading;
      }
      state.root
        .querySelectorAll<HTMLElement>("[data-outline-key]")
        .forEach((li) => {
          li.classList.toggle(
            "b3-list-item--focus",
            li.dataset.outlineKey === view.outlineCurrent,
          );
        });
    }
  }
  destroy() {
    this.closed = true;
    this.observer.disconnect();
    document.removeEventListener("pointerdown", this.schedule, true);
    for (const [panel, state] of this.panels) {
      state.root.remove();
      panel.classList.remove("sb-outline-host");
    }
    this.panels.clear();
  }
}
