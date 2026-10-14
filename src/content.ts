import Defuddle, { createMarkdownContent } from "defuddle/full";
import DOMPurify from "dompurify";
export interface Article {
  title: string;
  url: string;
  html: string;
  fallback: boolean;
}
/** Use Web Clipper's extraction and Markdown engine; sanitize only after math
 * and other semantic elements have been standardized by Defuddle. */
export function extract(
  html: string,
  url: string,
  title: string,
  selection = false,
): Article {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);
  if (!doc.title) doc.title = title;
  // Capture inert MathJax v2 sources before upstream's sibling-script cleanup.
  // Defuddle still performs all math normalization and Markdown conversion.
  for (const script of doc.querySelectorAll('script[type^="math/tex"]')) {
    const math = doc.createElement("math");
    math.setAttribute("data-latex", script.textContent || "");
    math.setAttribute(
      "display",
      /mode\s*=\s*display/.test(script.getAttribute("type") || "")
        ? "block"
        : "inline",
    );
    math.textContent = script.textContent;
    script.replaceWith(math);
  }
  // Article extraction demotes h1 and removes the title heading. A selected
  // heading is intentional content, so shield its level during normalization.
  const headings = new Map<string, { tag: string; id: string | null }>();
  if (selection)
    for (const heading of doc.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
      const id = `sb-copy-heading-${headings.size}`;
      headings.set(id, {
        tag: heading.tagName.toLowerCase(),
        id: heading.getAttribute("id"),
      });
      const shield = doc.createElement("p");
      shield.title = id;
      shield.innerHTML = heading.innerHTML;
      heading.replaceWith(shield);
    }
  const parsed = new Defuddle(doc, {
    url,
    useAsync: false,
    ...(selection
      ? {
          contentSelector: "body",
          removeLowScoring: false,
          removeExactSelectors: false,
          removePartialSelectors: false,
          removeSmallImages: false,
          removeContentPatterns: false,
        }
      : {}),
  }).parse();
  const fallback = !parsed.content?.trim();
  const body = new DOMParser().parseFromString(
    fallback ? html : parsed.content,
    "text/html",
  );
  for (const [id, original] of headings) {
    const heading = body.querySelector(`p[title="${id}"]`);
    if (!heading) continue;
    const restored = body.createElement(original.tag);
    if (original.id) restored.id = original.id;
    restored.innerHTML = heading.innerHTML;
    heading.replaceWith(restored);
  }
  // Resolve resources against the source page, while retaining footnote anchors
  // for Defuddle's Markdown rules. assets paths are substituted later by runSave.
  for (const el of body.querySelectorAll("[src],[href],[poster]")) {
    for (const attr of ["src", "href", "poster"]) {
      const value = el.getAttribute(attr);
      if (!value || (attr === "href" && value.startsWith("#"))) continue;
      try {
        el.setAttribute(attr, new URL(value, url).href);
      } catch {
        el.removeAttribute(attr);
      }
    }
  }
  return {
    title: parsed.title || title || "Web page",
    url,
    fallback,
    html: DOMPurify.sanitize(body.body.innerHTML, {
      FORBID_TAGS: [
        "style",
        "script",
        "iframe",
        "form",
        "input",
        "button",
        "object",
        "embed",
        "base",
      ],
      FORBID_ATTR: ["style", "srcset"],
      ADD_ATTR: ["display", "encoding", "alttext"],
    }),
  };
}
export function markdown(html: string, url = ""): string {
  return createMarkdownContent(html, url);
}
export const collectSource = `(() => { const doc=document.documentElement.cloneNode(true); const live=[...document.images],copy=[...doc.querySelectorAll('img')]; copy.forEach((e,i)=>{if(live[i]?.currentSrc)e.setAttribute('src',live[i].currentSrc)}); return {html:doc.outerHTML,title:document.title,url:location.href}; })()`;
export const collectSelection = `(() => {const s=getSelection();if(!s||!s.rangeCount)return '';const e=document.createElement('div');e.append(s.getRangeAt(0).cloneContents());return e.innerHTML;})()`;
